import type { Ignore } from 'ignore'
import type { AddonID, Minecraftinstance } from './minecraftinstance.js'
import ignore from 'ignore'

type IgnoreArgument = Parameters<Ignore['add']>[0]

function getIgnoredModIds(mci: Minecraftinstance, ignoreArg?: IgnoreArgument): Set<AddonID> {
  const ignoredByUnavailable = mci.installedAddons.filter(
    addon => !addon.installedFile?.isAvailable
  )

  if (!ignoreArg) return new Set(ignoredByUnavailable.map(addon => addon.addonID))

  const ignoring = (ignore as unknown as () => Ignore)().add(ignoreArg)
  const ignoredByDevonly = mci.installedAddons.filter(addon =>
    ignoring.ignores(`mods/${addon?.installedFile?.fileNameOnDisk}`)
  )

  return new Set(
    [...ignoredByDevonly, ...ignoredByUnavailable].map(addon => addon.addonID)
  )
}

/**
 * Load a filtered view of a minecraftinstance.json object.
 *
 * Returns a shallow-cloned instance with `installedAddons` narrowed to
 * on-CF, non-ignored mods. The original `mci` is not mutated.
 *
 * @param mci Parsed `minecraftinstance.json`.
 * @param ignore .gitignore-like content — mods matching these patterns (by `mods/<file>`) are excluded.
 */
export function loadMCInstanceFiltered(
  mci: Minecraftinstance,
  ignore?: IgnoreArgument
): Minecraftinstance {
  const ignoredModIds = getIgnoredModIds(mci, ignore)
  return {
    ...mci,
    installedAddons: mci.installedAddons.filter(a => !ignoredModIds.has(a.addonID)),
  }
}

/**
 * Collect the full set of addons from a single minecraftinstance, after
 * applying the same `.gitignore`-style filter as {@link modListDiff}.
 *
 * Use this when you don't have a previous instance to compare against.
 */
export function modListUnion(fresh: Minecraftinstance, ignore?: IgnoreArgument): import('./types.js').ModsUnion {
  return { union: loadMCInstanceFiltered(fresh, ignore).installedAddons }
}

function keyBy<T>(arr: T[], key: keyof T): Record<number, T> {
  return Object.fromEntries(arr.map(o => [o[key] as number, o]))
}

/**
 * Compare two minecraftinstance.json snapshots and return a full breakdown
 * (`added`, `removed`, `both`, `updated`, plus the total `union`).
 *
 * Use this when you have the previous version to diff against, typically for
 * generating a changelog.
 */
export function modListDiff(
  fresh: Minecraftinstance,
  old: Minecraftinstance,
  ignore?: IgnoreArgument
): import('./types.js').ModsComparison {
  const B = loadMCInstanceFiltered(fresh, ignore).installedAddons
  const A = loadMCInstanceFiltered(old, ignore).installedAddons

  const map_A = keyBy(A, 'addonID')
  const map_B = keyBy(B, 'addonID')
  const map_union = { ...map_A, ...map_B }

  const both = B.filter(o => map_A[o.addonID])
  const updated = both
    .filter(o => map_A[o.addonID]?.installedFile?.id !== o.installedFile?.id)
    .map(o => ({ now: o, was: map_A[o.addonID] }))

  return {
    union  : Object.values(map_union),
    both,
    added  : B.filter(o => !map_A[o.addonID]),
    removed: A.filter(o => !map_B[o.addonID]),
    updated,
  }
}
