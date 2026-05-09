import type { ReducerCache } from './cache.js'
import type { Mod } from './Mod.js'
import { loadJarMcmodInfo } from './jarMeta.js'

// Single-line normalize: collapse all whitespace runs (including \r\n, \n, \t,
// double spaces) into a single space and trim. Multi-line descriptions in
// CF/mcmod.info would otherwise wrap the row and break the table layout.
function sanitize(s: string | undefined | null): string {
  if (!s) return ''
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Lazily resolves a one-line description for each mod. Used by the mod
 * selector's adaptive layout to show muted, truncated descriptions when there
 * is horizontal room.
 *
 * Source priority:
 *   1. CurseForge addon `summary` if the local minecraftinstance.json exposes
 *      it (it usually does NOT — the field exists only on API responses).
 *   2. The first `description` entry from the jar's `mcmod.info` (read on
 *      demand, cached via the `unstorage`-backed `ReducerCache`).
 *
 * The service exposes a tiny pub/sub so React components can re-render once
 * a description finishes loading without polling.
 */
export class DescriptionService {
  private cache    = new Map<Mod, string>()
  private inflight = new Set<Mod>()
  private listeners = new Set<() => void>()
  private active = 0

  constructor(
    private readonly modsPath: string,
    private readonly cacheStore?: ReducerCache,
    private readonly concurrency = 2
  ) {}

  /**
   * Return a description for the mod, if known. Falls back to whatever the
   * underlying CurseForge metadata exposes — for E2E packs this is typically
   * empty, but third-party packs sometimes embed a `summary`.
   */
  get(mod: Mod): string | undefined {
    const summary = sanitize((mod.addon as unknown as { summary?: string } | undefined)?.summary)
    if (summary) return summary
    const cached = this.cache.get(mod)
    return cached || undefined
  }

  /** Schedule a background load of mcmod.info for one mod. Idempotent. */
  scheduleLoad(mod: Mod): void {
    if (this.cache.has(mod) || this.inflight.has(mod)) return
    if (this.get(mod)) return
    this.inflight.add(mod)
    this.active++
    void (async () => {
      try {
        const info = await loadJarMcmodInfo(this.modsPath, mod.fileName, this.cacheStore)
        const desc = sanitize(info?.[0]?.description)
        // Empty string is recorded too — it means "we looked, found nothing"
        // so we don't keep retrying.
        this.cache.set(mod, desc)
        this.emit()
      }
      catch { /* silently ignore — description is best-effort */ }
      finally {
        this.inflight.delete(mod)
        this.active--
      }
    })()
  }

  /** Schedule loads for many mods. The underlying jarMeta cache deduplicates. */
  prefetch(mods: Mod[]): void {
    for (const m of mods) this.scheduleLoad(m)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }
}
