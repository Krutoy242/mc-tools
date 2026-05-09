import type { Mod } from './Mod.js'

export type Status = 'suspect' | 'trusted' | 'ignored'

export type StatusMap = Map<Mod, Status>

export interface BundleId { id: number }

export interface DependencyBundle {
  id     : number
  /** Mods belonging to this connected component (treating dep edges undirected). */
  members: Mod[]
}

export interface PartitionPlan {
  /** Mods that must be enabled in this iteration. */
  enable          : Set<Mod>
  /** Mods that must be disabled in this iteration. */
  disable         : Set<Mod>
  /** Suspects that ended up in the enabled half. Used for reclassification. */
  enabledSuspects : Set<Mod>
  /** Suspects that ended up in the disabled half. Used for reclassification. */
  disabledSuspects: Set<Mod>
}

export function getStatus(map: StatusMap, mod: Mod): Status {
  return map.get(mod) ?? 'suspect'
}

/**
 * Compute connected components of the suspect subgraph treating dependency
 * edges as undirected. The result is used both for visualization (color tints)
 * and as a hint for partitioning: mods in the same component will move together
 * more often than not, but the algorithm is allowed to split them when doing so
 * still respects the "downward-closed" requirement.
 */
export function computeBundles(suspects: Mod[]): DependencyBundle[] {
  const inSet = new Set(suspects)
  const visited = new Set<Mod>()
  const bundles: DependencyBundle[] = []

  for (const seed of suspects) {
    if (visited.has(seed)) continue
    const stack = [seed]
    const members: Mod[] = []
    while (stack.length) {
      const m = stack.pop()!
      if (visited.has(m)) continue
      visited.add(m)
      members.push(m)
      for (const d of m.dependencies) {
        if (inSet.has(d) && !visited.has(d)) stack.push(d)
      }
      for (const d of m.dependents) {
        if (inSet.has(d) && !visited.has(d)) stack.push(d)
      }
    }
    bundles.push({ id: bundles.length, members })
  }

  return bundles
}

/**
 * Compute the required-dependency closure of a single mod within the suspect set.
 * Returned set always contains `mod` itself. Following dependency edges only —
 * dependents are *not* included, because enabling X does not force enabling
 * mods that merely depend on X.
 */
export function requiredClosure(mod: Mod, suspects: Set<Mod>): Set<Mod> {
  const out = new Set<Mod>([mod])
  const stack = [mod]
  while (stack.length) {
    const m = stack.pop()!
    for (const d of m.dependencies) {
      if (!suspects.has(d) || out.has(d)) continue
      out.add(d)
      stack.push(d)
    }
  }
  return out
}

/**
 * Plan the next partition. Returns sets of mods to enable/disable so that:
 *  - Trusted mods stay disabled.
 *  - Ignored mods stay enabled.
 *  - The enabled half of suspects is a downward-closed subset (every required
 *    dep of an enabled suspect is also enabled).
 *  - The two halves are roughly equal in size.
 *
 * Strategy: order suspects by descending required-closure size, then greedily
 * include each one's full closure into the enabled half until we cross |S|/2.
 * The closure operation guarantees the downward-closed property.
 */
export function nextPartition(mods: Mod[], status: StatusMap): PartitionPlan {
  const suspects = mods.filter(m => getStatus(status, m) === 'suspect')
  const suspectSet = new Set(suspects)
  const target = Math.ceil(suspects.length / 2)

  // Precompute closure sizes to avoid O(n²) recomputation inside sort.
  const closureSize = new Map<Mod, number>()
  for (const m of suspects) closureSize.set(m, requiredClosure(m, suspectSet).size)

  // Order: largest closures first, then by dependents (libraries before clients)
  // so we tend to include shared libraries early and reuse them.
  const ordered = [...suspects].sort((a, b) => {
    const ca = closureSize.get(a)!
    const cb = closureSize.get(b)!
    if (cb !== ca) return cb - ca
    return b.dependents.size - a.dependents.size
  })

  const enabledSuspects = new Set<Mod>()
  for (const m of ordered) {
    if (enabledSuspects.size >= target) break
    if (enabledSuspects.has(m)) continue
    for (const dep of requiredClosure(m, suspectSet)) enabledSuspects.add(dep)
  }

  // Closure overshoot: a single suspect's required closure pulled in every
  // other suspect, leaving the disabled half empty. Fall back to disabling at
  // least one leaf (a suspect with the smallest closure and fewest dependents)
  // so the iteration makes some progress instead of looping forever.
  if (enabledSuspects.size > 0 && enabledSuspects.size >= suspects.length && suspects.length > 1) {
    pruneToLeaf(enabledSuspects, suspects, suspectSet)
  }

  const disabledSuspects = new Set(suspects.filter(m => !enabledSuspects.has(m)))

  const enable  = new Set<Mod>()
  const disable = new Set<Mod>()
  for (const m of mods) {
    const s = getStatus(status, m)
    if (s === 'ignored')      enable.add(m)
    else if (s === 'trusted') disable.add(m)
    else (enabledSuspects.has(m) ? enable : disable).add(m)
  }

  return { enable, disable, enabledSuspects, disabledSuspects }
}

/**
 * In-place prune of `enabledSuspects` so the disabled half is non-empty.
 *
 * Strategy: pick a leaf — a suspect with the smallest required-closure within
 * the suspect set and the fewest dependents — and remove it together with all
 * other suspects whose required closure includes it. The result stays
 * downward-closed (if a suspect requires the removed mod, it must also be
 * removed) while guaranteeing at least one mod ends up disabled.
 */
function pruneToLeaf(enabled: Set<Mod>, suspects: Mod[], suspectSet: Set<Mod>): void {
  const ordered = [...suspects].sort((a, b) => {
    const ca = requiredClosure(a, suspectSet).size
    const cb = requiredClosure(b, suspectSet).size
    if (ca !== cb) return ca - cb
    return a.dependents.size - b.dependents.size
  })
  const leaf = ordered[0]
  if (!leaf) return
  enabled.delete(leaf)
  for (const m of suspects) {
    if (!enabled.has(m)) continue
    if (requiredClosure(m, suspectSet).has(leaf)) enabled.delete(m)
  }
  // Edge case: if pruning emptied the enabled half (cyclic / fully connected
  // suspects), restore the leaf alone so we still produce a usable plan.
  if (enabled.size === 0) enabled.add(leaf)
}

/**
 * Apply the answer to "does the bug still persist?" — exonerate the half that
 * could not have been the cause and re-classify those mods as trusted.
 */
export function classifyAfterAnswer(
  status: StatusMap,
  plan: PartitionPlan,
  bugStillPersists: boolean
): StatusMap {
  const next = new Map(status)
  // If the bug persists, the cause is currently enabled → exonerate the disabled half.
  // If the bug is gone, the cause is currently disabled → exonerate the enabled half.
  const exonerated = bugStillPersists ? plan.disabledSuspects : plan.enabledSuspects
  for (const m of exonerated) next.set(m, 'trusted')
  return next
}

export function countByStatus(mods: Mod[], status: StatusMap) {
  let suspect = 0
  let trusted = 0
  let ignored = 0
  for (const m of mods) {
    const s = getStatus(status, m)
    if (s === 'trusted') trusted++
    else if (s === 'ignored') ignored++
    else suspect++
  }
  return { suspect, trusted, ignored, total: mods.length }
}

/** Small helper used both internally and in tests. */
export function partition<T>(arr: T[], pred: (v: T) => boolean): [T[], T[]] {
  const yes: T[] = []
  const no: T[] = []
  for (const v of arr) (pred(v) ? yes : no).push(v)
  return [yes, no]
}
