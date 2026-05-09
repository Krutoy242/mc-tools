import type { Branch, ReducerConfig } from './config.js'

import type { MCInstance } from './minecraftinstance.js'
import type { ModdedAddon } from './Mod.js'
import { readFile } from 'node:fs/promises'
import { naturalSort } from '@mctools/utils/natural-sort'
import fast_glob from 'fast-glob'
import levenshtein from 'fast-levenshtein'
import { join, resolve } from 'pathe'

import { DependencyLevel, Mod, purify } from './Mod.js'

/** Levenshtein gap below which a fuzzy filename match is considered ambiguous. */
const FUZZY_AMBIGUITY_THRESHOLD = 5

export type WarningKind = 'noAddon' | 'noDependencies' | 'missingDependency' | 'multipleMatches'

/**
 * Structured payload attached to a warning. Used by the FixDeps screen to
 * resolve missing dependencies via CurseForge lookup and to inspect orphan
 * jars via `mcmod.info`.
 */
export interface WarningData {
  /** The mod that reported the warning (e.g. the mod whose dep is missing). */
  parent?        : Mod
  /** Filename of the orphan jar (for `noAddon`). */
  fileName?      : string
  /** CurseForge addon id of the missing dependency (for `noDependencies`). */
  missingAddonId?: number
  /** Free-form identifier of the missing custom dependency (for `missingDependency`). */
  missingMod?    : string
}

export interface WarningEntry {
  kind   : WarningKind
  message: string
  /** Stable key used for deduplication across rebuilds. */
  key    : string
  /** Structured payload for downstream tooling (FixDeps, etc.). */
  data?  : WarningData
}

/**
 * Per-session cache used to deduplicate noisy warnings so the user only sees
 * each unique problem once, even across multiple ModStore rebuilds.
 */
export interface WarningCache {
  seen: Set<string>
  all : WarningEntry[]
}

export function createWarningCache(): WarningCache {
  return { seen: new Set(), all: [] }
}

function pushWarning(cache: WarningCache, entry: WarningEntry) {
  if (cache.seen.has(entry.key)) return
  cache.seen.add(entry.key)
  cache.all.push(entry)
}

export interface ModStoreLoadResult {
  mods    : Mod[]
  warnings: WarningEntry[]
}

export class ModStore {
  readonly mods    : Mod[] = []
  /** Warnings generated during this load, before being merged into the shared cache. */
  readonly warnings: WarningEntry[] = []

  private constructor() {}

  static async load(
    mcPath: string,
    config: ReducerConfig,
    cache: WarningCache = createWarningCache()
  ): Promise<ModStore> {
    const store = new ModStore()
    await store.init(mcPath, config, cache)
    return store
  }

  private async init(mcPath: string, config: ReducerConfig, cache: WarningCache) {
    const mcInstance = JSON.parse(
      await readFile(join(mcPath, 'minecraftinstance.json'), 'utf8')
    ) as MCInstance

    Mod.modsPath = join(mcPath, 'mods')
    const fetched = await fetchInModsDirAsync(Mod.modsPath, [
      '*.jar?(.disabled)?(.disabled)?(.disabled)?(.disabled)',
      '*.jar',
    ])

    for (const fileName of new Set(fetched)) {
      const addon = findAddonByFilename(mcInstance.installedAddons, fileName)
      const mod = new Mod(fileName, addon)
      if (addon) {
        addon.mod = mod
      }
      else {
        this.warn(cache, {
          kind   : 'noAddon',
          key    : `noAddon:${fileName}`,
          message: mod.displayRaw,
          data   : { parent: mod, fileName },
        })
      }
      this.mods.push(mod)
    }

    // CF-defined dependencies
    for (const m of this.mods) {
      const cfDependencies = m.addon?.installedFile.dependencies ?? []
      const required = cfDependencies.filter(({ type }) => type === DependencyLevel.Required)
      const deps = required.map((d) => {
        const r = mcInstance.installedAddons.find(o =>
          o.addonID === d.addonId
          || config.forks[d.addonId]?.includes(o.addonID)
        ) as ModdedAddon
        if (!r) {
          this.warn(cache, {
            kind   : 'noDependencies',
            key    : `noDeps:${m.fileName}:${d.addonId}`,
            message: `${m.addon?.name ?? m.fileNameNoExt} requires id ${d.addonId}`,
            data   : { parent: m, missingAddonId: d.addonId },
          })
        }
        return r?.mod
      })
        .filter((m): m is Mod => !!m)

      m.addDependency(deps)
    }

    // Custom dependencies
    for (const [mod, dep] of flatTree(config.dependencies)) {
      const m = this.findMod(mod, cache)
      if (!m) continue
      const d = this.findMod(dep, cache)
      if (!d) {
        this.warn(cache, {
          kind   : 'missingDependency',
          key    : `missingDep:${m.fileName}:${dep}`,
          message: `Mod "${m.fileName}" must have dependency [${dep}] but none found`,
          data   : { parent: m, missingMod: dep },
        })
        continue
      }
      m.addDependency(d)
    }

    for (const [mod, dep] of flatTree(config.dependents)) {
      const m = this.findMod(mod, cache)
      if (!m) continue
      const d = this.findMod(dep, cache)
      if (!d) continue
      d.addDependency(m)
    }

    this.mods.sort((a, b) =>
      a.getDepsLevel() - b.getDepsLevel()
      || a.dependents.size - b.dependents.size
      || naturalSort(a.fileName ?? '', b.fileName ?? ''))
  }

  private warn(cache: WarningCache, entry: WarningEntry) {
    if (cache.seen.has(entry.key)) return
    pushWarning(cache, entry)
    this.warnings.push(entry)
  }

  private findMod(modRegexp: string, cache: WarningCache): Mod | undefined {
    let rgx: RegExp
    try {
      rgx = new RegExp(modRegexp, 'i')
    }
    catch {
      this.warn(cache, {
        kind   : 'missingDependency',
        key    : `badRegex:${modRegexp}`,
        message: `Invalid regex in config: "${modRegexp}"`,
      })
      return undefined
    }
    const list = this.mods.filter(m =>
      m.addon?.name === modRegexp
      || m.addon?.name.match(rgx)
      || rgx.test(m.fileName)
    )
    list.sort((a, b) => (a.addon?.name.length ?? 0) - (b.addon?.name.length ?? 0))
    if (list.length > 1) {
      this.warn(cache, {
        kind   : 'multipleMatches',
        key    : `multi:${modRegexp}:${list.map(m => m.fileName).join(',')}`,
        message: `Multiple matches of "${modRegexp}": ${list.map(m => m.addon?.name ?? m.fileName).join(', ')}`,
      })
    }
    return list[0]
  }
}

function flatTree(tree: Branch): [string, string][] {
  const result: [string, string][] = []
  Object.entries(tree).forEach(([trunk, branches]) => {
    for (const branch of [branches].flat()) {
      if (typeof branch === 'object' && branch !== null) {
        for (const b of Object.keys(branch)) result.push([trunk, b])
        result.push(...flatTree(branch))
      }
      else {
        result.push([trunk, branch])
      }
    }
  })
  return result
}

async function fetchInModsDirAsync(modsPath: string, patterns: string[]): Promise<string[]> {
  const all: string[] = []
  for (const p of patterns) {
    const found = await fast_glob(p, { dot: true, cwd: resolve(modsPath) })
    all.push(...found)
  }
  if (!all.length) {
    // Re-check with the canonical pattern: the dir might exist but have no jars.
    const baseline = await fast_glob('*.jar?(.disabled)', { dot: true, cwd: resolve(modsPath) })
    if (!baseline.length)
      throw new Error(`${modsPath} doesn't have mods in it (files ending with .jar and/or .disabled)`)
  }
  return all
}

/** Kept as a sync helper for the smoke test, mirrors the async version above. */
export function getFetchInModsDir(mods: string): (globPattern: string) => string[] {
  function fetchInModsDir(globPattern: string): string[] {
    return fast_glob.sync(globPattern, { dot: true, cwd: resolve(mods) })
  }
  if (!fetchInModsDir('*.jar?(.disabled)').length)
    throw new Error(`${mods} doesn't have mods in it (files ends with .jar and/or .disabled)`)
  return fetchInModsDir
}

function findAddonByFilename(addons: ModdedAddon[], fileName: string): ModdedAddon | undefined {
  const pureName = purify(fileName)

  const exact = addons.find(a => purify(a.installedFile.fileNameOnDisk) === pureName)
  if (exact) return exact

  if (addons.length === 0) return undefined

  const levArr = addons
    .map(a => ({
      lev  : levenshtein.get(purify(a.installedFile.fileNameOnDisk) ?? '', pureName ?? ''),
      addon: a,
    }))
    .sort((a, b) => a.lev - b.lev)

  const [best, second] = levArr
  if (second && second.lev - best.lev < FUZZY_AMBIGUITY_THRESHOLD) return undefined
  return best.addon
}

/**
 * Read the modpack name from minecraftinstance.json (preferred) or manifest.json,
 * falling back to the directory basename. Used to seed the theme palette.
 */
export async function readModpackName(mcPath: string): Promise<string> {
  try {
    const raw = await readFile(join(mcPath, 'minecraftinstance.json'), 'utf8')
    const data = JSON.parse(raw) as { name?: string, installedModpack?: { name?: string } }
    if (data.installedModpack?.name) return data.installedModpack.name
    if (data.name) return data.name
  }
  catch { /* fall through */ }
  try {
    const raw = await readFile(join(mcPath, 'manifest.json'), 'utf8')
    const data = JSON.parse(raw) as { name?: string }
    if (data.name) return data.name
  }
  catch { /* fall through */ }
  const parts = resolve(mcPath).split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? 'Modpack'
}
