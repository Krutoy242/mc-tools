import type { ResolvableAddon } from '@mctools/utils/mod-resolve'
import type { Mod } from '../Mod.js'
import { matchAddons } from '@mctools/utils/mod-resolve'

interface ModView extends ResolvableAddon {
  mod: Mod
}

function view(mod: Mod): ModView {
  return {
    addonID       : mod.addon?.addonID ?? -1,
    name          : mod.displayName,
    fileNameOnDisk: mod.fileName,
    mod,
  }
}

export type ModResolution
  = | { kind: 'ok',        query: string, mod: Mod }
    | { kind: 'notfound',  query: string }
    | { kind: 'ambiguous', query: string, candidates: Mod[] }

/** Resolve a single free-form query (id / name / filename) to one Mod. */
export function resolveMod(mods: Mod[], query: string): ModResolution {
  const matches = matchAddons(mods.map(view), query)
  if (matches.length === 0) return { kind: 'notfound', query }
  const top = matches[0].score
  const tied = matches.filter(m => m.score === top)
  if (tied.length > 1) {
    return { kind: 'ambiguous', query, candidates: tied.slice(0, 6).map(m => m.addon.mod) }
  }
  return { kind: 'ok', query, mod: matches[0].addon.mod }
}

export interface ResolveManyResult {
  /** Successfully resolved mods, de-duplicated, in first-seen order. */
  mods    : Mod[]
  /** Per-query failures (not found / ambiguous). */
  failures: Exclude<ModResolution, { kind: 'ok' }>[]
}

/** Resolve every query, collecting both the hits and the failures. */
export function resolveMods(mods: Mod[], queries: string[]): ResolveManyResult {
  const seen = new Set<Mod>()
  const out: Mod[] = []
  const failures: Exclude<ModResolution, { kind: 'ok' }>[] = []
  for (const q of queries) {
    const r = resolveMod(mods, q)
    if (r.kind === 'ok') {
      if (!seen.has(r.mod)) {
        seen.add(r.mod)
        out.push(r.mod)
      }
    }
    else {
      failures.push(r)
    }
  }
  return { mods: out, failures }
}
