import type { ReducerCache } from './cache.js'
import type { Mod } from './Mod.js'
import { Buffer } from 'node:buffer'
import { stat } from 'node:fs/promises'
import { resolve } from 'pathe'
import yauzl from 'yauzl'

export interface JarMeta {
  /** File size in bytes. */
  size      : number
  /** Number of `.class` entries inside the jar. */
  classCount: number
  /** Total entry count including non-class files. */
  entryCount: number
  /** Modified-time of the file when the metadata was captured. */
  mtimeMs   : number
}

/**
 * One entry from a jar's `mcmod.info` (Forge 1.7-1.12 metadata file).
 * All fields are optional because the file format is loosely specified.
 */
export interface McmodInfoEntry {
  modid?       : string
  name?        : string
  description? : string
  version?     : string
  mcversion?   : string
  url?         : string
  authorList?  : string[]
  credits?     : string
  dependencies?: string[]
}

interface CacheKeyParts {
  fileName: string
  size    : number
  mtimeMs : number
}

function cacheKey({ fileName, size, mtimeMs }: CacheKeyParts) {
  return `jarMeta:${fileName}:${size}:${Math.floor(mtimeMs)}`
}

function mcmodInfoCacheKey({ fileName, size, mtimeMs }: CacheKeyParts) {
  return `mcmodInfo:${fileName}:${size}:${Math.floor(mtimeMs)}`
}

/**
 * Count `.class` entries by reading only the central directory of the jar.
 * No file content is decompressed, so this stays cheap even for fat jars.
 */
async function readEntries(jarPath: string): Promise<{ classCount: number, entryCount: number }> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        rejectPromise(err ?? new Error('failed to open jar'))
        return
      }

      let classCount = 0
      let entryCount = 0
      zip.on('entry', (entry: { fileName: string }) => {
        entryCount++
        if (entry.fileName.endsWith('.class')) classCount++
        // Yield to the event loop between entries so we don't starve the UI on
        // huge jars. setImmediate is cheap; the cost is dominated by I/O anyway.
        setImmediate(() => zip.readEntry())
      })
      zip.on('end', () => {
        zip.close()
        resolvePromise({ classCount, entryCount })
      })
      zip.on('error', (e) => {
        zip.close()
        rejectPromise(e)
      })
      zip.readEntry()
    })
  })
}

export async function loadJarMeta(
  modsPath: string,
  fileName: string,
  cache?: ReducerCache
): Promise<JarMeta> {
  const fullPath = resolve(modsPath, fileName)
  const st = await stat(fullPath)
  const key = cacheKey({ fileName, size: st.size, mtimeMs: st.mtimeMs })

  if (cache) {
    const cached = await cache.getItem<JarMeta>(key)
    if (cached) return cached
  }

  // Skip parsing for files renamed with .disabled — yauzl chokes on bare paths
  // sometimes; the rename doesn't change the zip body so we can read either.
  const { classCount, entryCount } = await readEntries(fullPath)
  const meta: JarMeta = { size: st.size, classCount, entryCount, mtimeMs: st.mtimeMs }
  if (cache) await cache.setItem(key, meta as unknown as Record<string, unknown>)
  return meta
}

/**
 * Read `mcmod.info` from the root of a Forge jar. Used for "no-addon" mods
 * (manually placed jars without CurseForge metadata) so we can still surface
 * a name and modid in the UI. Returns `undefined` if the jar contains no
 * `mcmod.info` file.
 */
export async function loadJarMcmodInfo(
  modsPath: string,
  fileName: string,
  cache?: ReducerCache
): Promise<McmodInfoEntry[] | undefined> {
  const fullPath = resolve(modsPath, fileName)
  const st = await stat(fullPath)
  const key = mcmodInfoCacheKey({ fileName, size: st.size, mtimeMs: st.mtimeMs })

  if (cache) {
    const cached = await cache.getItem<McmodInfoEntry[] | { __empty: true }>(key)
    if (cached) {
      if (typeof cached === 'object' && cached && '__empty' in cached) return undefined
      return cached
    }
  }

  const result = await readMcmodInfoFromJar(fullPath)
  if (cache) {
    await cache.setItem(
      key,
      (result ?? { __empty: true }) as unknown as Record<string, unknown>
    )
  }
  return result
}

async function readMcmodInfoFromJar(jarPath: string): Promise<McmodInfoEntry[] | undefined> {
  return new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        rejectPromise(err ?? new Error('failed to open jar'))
        return
      }

      let found = false
      zip.on('entry', (entry: { fileName: string, [k: string]: unknown }) => {
        if (entry.fileName === 'mcmod.info' || entry.fileName === 'META-INF/mcmod.info') {
          found = true

          zip.openReadStream(entry as never, (err2, stream) => {
            if (err2 || !stream) {
              resolvePromise(undefined)
              zip.close()
              return
            }
            const chunks: Buffer[] = []
            stream.on('data', (c: Buffer) => chunks.push(c))
            stream.on('end', () => {
              try {
                const raw = Buffer.concat(chunks).toString('utf8')
                const parsed = JSON.parse(raw) as unknown
                resolvePromise(normalizeMcmodInfo(parsed))
              }
              catch {
                resolvePromise(undefined)
              }
              finally {
                zip.close()
              }
            })
            stream.on('error', () => {
              resolvePromise(undefined)
              zip.close()
            })
          })
          return
        }
        setImmediate(() => zip.readEntry())
      })
      zip.on('end', () => {
        if (!found) {
          resolvePromise(undefined)
          zip.close()
        }
      })
      zip.on('error', (e) => {
        zip.close()
        rejectPromise(e)
      })
      zip.readEntry()
    })
  })
}

function normalizeMcmodInfo(raw: unknown): McmodInfoEntry[] | undefined {
  // mcmod.info comes in two flavors: a top-level array, or `{ modList: [...] }`.
  if (Array.isArray(raw)) return raw as McmodInfoEntry[]
  if (raw && typeof raw === 'object' && 'modList' in raw) {
    const list = raw.modList
    if (Array.isArray(list)) return list as McmodInfoEntry[]
  }
  return undefined
}

/**
 * Adjacency-aware concurrent loader. Given a focus index and a list of mods,
 * loads the focused mod first, then radiates outward (i+1, i-1, i+2, i-2 ...)
 * up to `radius` neighbors. Concurrency is capped, and an in-flight registry
 * dedupes overlapping prefetches when focus moves quickly.
 */
export class JarMetaLoader {
  private inflight = new Map<string, Promise<JarMeta>>()
  private done     = new Map<string, JarMeta>()
  private queue: Array<() => Promise<void>> = []
  private active = 0

  constructor(
    private readonly modsPath: string,
    private readonly cache?: ReducerCache,
    private readonly concurrency = 2
  ) {}

  /** Get cached metadata if loaded, otherwise undefined. */
  peek(mod: Mod): JarMeta | undefined {
    return this.done.get(mod.fileName)
  }

  /** Snapshot of every metadata we have already resolved. */
  peekAll(): Map<string, JarMeta> {
    return new Map(this.done)
  }

  /** Load a single mod, returning the existing promise if already in flight. */
  async load(mod: Mod): Promise<JarMeta> {
    const cached = this.done.get(mod.fileName)
    if (cached) return Promise.resolve(cached)
    const inflight = this.inflight.get(mod.fileName)
    if (inflight) return inflight

    let resolveFn!: (m: JarMeta) => void
    let rejectFn!: (e: unknown) => void
    const promise = new Promise<JarMeta>((res, rej) => {
      resolveFn = res
      rejectFn = rej
    })
    this.inflight.set(mod.fileName, promise)

    const task = async () => {
      try {
        const meta = await loadJarMeta(this.modsPath, mod.fileName, this.cache)
        this.done.set(mod.fileName, meta)
        resolveFn(meta)
      }
      catch (e) {
        rejectFn(e)
      }
      finally {
        this.inflight.delete(mod.fileName)
        this.active--
        this.pump()
      }
    }
    this.queue.push(task)
    this.pump()
    return promise
  }

  /** Schedule prefetch around the focus index. */
  prefetch(mods: Mod[], focusIdx: number, radius = 5): void {
    const order: number[] = [focusIdx]
    for (let d = 1; d <= radius; d++) {
      if (focusIdx + d < mods.length) order.push(focusIdx + d)
      if (focusIdx - d >= 0) order.push(focusIdx - d)
    }
    for (const i of order) {
      const m = mods[i]
      if (!m) continue
      if (this.done.has(m.fileName) || this.inflight.has(m.fileName)) continue
      // Fire and forget — load() handles dedupe and queuing internally.
      void this.load(m).catch(() => {})
    }
  }

  /**
   * Schedule every mod for background scanning. Safe to call multiple times —
   * already-resolved or in-flight mods are skipped. Concurrency is capped by
   * the loader's existing scheduler so the UI stays responsive.
   */
  scanAll(mods: Mod[]): void {
    for (const m of mods) {
      if (this.done.has(m.fileName) || this.inflight.has(m.fileName)) continue
      void this.load(m).catch(() => {})
    }
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.active++
      void task()
    }
  }
}
