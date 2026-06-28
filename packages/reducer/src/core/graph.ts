import type { Mod } from '../Mod.js'

/**
 * Transitive dependency closure of `seeds` (each seed plus every mod it
 * requires, directly or indirectly). Enabling any seed implies enabling this
 * whole set, so it is the "must stay enabled" set for `enable` / `only`.
 */
export function dependencyClosure(seeds: Iterable<Mod>): Set<Mod> {
  const out = new Set<Mod>()
  const stack = [...seeds]
  while (stack.length) {
    const m = stack.pop()!
    if (out.has(m)) continue
    out.add(m)
    for (const d of m.dependencies) {
      if (!out.has(d)) stack.push(d)
    }
  }
  return out
}

/**
 * Transitive dependents closure of `seeds` (each seed plus every mod that
 * requires it, directly or indirectly). Disabling any seed implies disabling
 * this whole set, so it is the "must go down" set for `disable` / `except`.
 */
export function dependentsClosure(seeds: Iterable<Mod>): Set<Mod> {
  const out = new Set<Mod>()
  const stack = [...seeds]
  while (stack.length) {
    const m = stack.pop()!
    if (out.has(m)) continue
    out.add(m)
    for (const d of m.dependents) {
      if (!out.has(d)) stack.push(d)
    }
  }
  return out
}
