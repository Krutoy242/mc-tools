/**
 * Get mod data from CurseForge or hashed file
 *
 * @author Krutoy242
 * @see {@link https://github.com/Krutoy242}
 */

import type { Ignore } from 'ignore'

import type { AddonID, InstalledAddon, Minecraftinstance } from './minecraftinstance.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

import process from 'node:process'
import CFV2 from 'curseforge-v2'
import fse from 'fs-extra'

import ignore from 'ignore'

export { asAddonID, asFileID } from './minecraftinstance.js'
export type { AddonID, FileID } from './minecraftinstance.js'

const { readJsonSync, writeJsonSync } = fse
const { CFV2Client } = CFV2
type ModCached = CFV2.CF2Addon & { __lastUpdated?: number }

const DEFAULT_CACHE_PATH = join(homedir(), '.cache', 'mctools', 'curseforge-mods.json')
let cachePathOverride: string | undefined

/** Override the file the CF mod cache reads/writes. Defaults to `~/.cache/mctools/curseforge-mods.json`. */
export function setCachePath(path: string): void {
  cachePathOverride = path
}

function getCachePath(): string {
  return cachePathOverride ?? process.env.MCTOOLS_CF_CACHE ?? DEFAULT_CACHE_PATH
}

/**
 * Get mod information from CurseForge, such as name, summary, download count, etc.
 * @param modIds IDs of mods you want to fetch. `[32274, 59751, 59816]`
 * @param cfApiKey CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys
 * @param timeout If file was already fetched last `timeout` hours, it would be loaded from cache file
 * @param doLogging Log into stdout
 * @returns Object with information about mods
 * @example const cfMods = await fetchMods([32274, 59751, 59816], key)
 * console.log(cfMods.map(m => m.name)) // ["JourneyMap", "Forestry", "Random Things"]
 */
export async function fetchMods(modIds: number[], cfApiKey: string, timeout = 96, doLogging = false): Promise<CFV2.CF2Addon[]> {
  const result: CFV2.CF2Addon[] = []
  const fromCFIds: number[] = []

  const cachePath = getCachePath()
  let cacheObj: Record<number, ModCached>

  try {
    cacheObj = readJsonSync(cachePath) as Record<number, ModCached>
  }
  catch {
    cacheObj = {}
  }

  modIds.forEach((modID) => {
    const cached = cachedMod(cacheObj[modID], timeout)
    if (cached) result.push(cached)
    else fromCFIds.push(modID)
  })
  if (doLogging) process.stdout.write(`Found cached mods: ${result.length} `)

  const cfLoaded = await loadFromCF(fromCFIds, cfApiKey)

  cfLoaded.forEach((mod) => {
    cacheObj[mod.id] = { __lastUpdated: Date.now(), ...mod }
  })
  if (cfLoaded.length) {
    fse.mkdirpSync(join(cachePath, '..'))
    writeJsonSync(cachePath, cacheObj)
  }

  return modIds.map(
    id => result.find(a => a.id === id) ?? cfLoaded.find(a => a.id === id) as CFV2.CF2Addon
  )
}

function cachedMod(cached: ModCached, timeout: number): CFV2.CF2Addon | undefined {
  if (!cached) return

  const hoursPass
    = (Date.now() - (cached.__lastUpdated ?? 0)) / (1000 * 60 * 60)
  if (hoursPass > timeout) return

  const result = { ...cached }
  delete result.__lastUpdated
  return result
}

let cachedClient: { key: string, client: CFV2.CFV2Client } | undefined

async function loadFromCF(modIds: number[], cfApiKey: string): Promise<CFV2.CF2Addon[]> {
  if (!modIds.length) return []

  // Rebuild client whenever API key changes — otherwise subsequent calls would
  // silently reuse the first key ever passed in, masking credential swaps.
  if (!cachedClient || cachedClient.key !== cfApiKey)
    cachedClient = { key: cfApiKey, client: new CFV2Client({ apiKey: cfApiKey }) }

  const mods = (await cachedClient.client.getMods({ modIds })).data?.data

  if (!mods || !mods.length)
    throw new Error(`Cant fetch mods for IDs: ${modIds.join(', ')}`)

  return mods
}

function keyBy<T extends { [key: string]: any }>(arr: T[], key: keyof T) {
  const result = {} as { [key: number]: T }
  arr.forEach(o => result[o[key]] = o)
  return result
}

type IgnoreArgument = Parameters<Ignore['add']>[0]

function getIgnoredModIds(mci: Minecraftinstance, ignoreArg?: IgnoreArgument): Set<AddonID> {
  const ignoredByUnavaliable = mci.installedAddons.filter(
    // Unavailable like Optifine or Nutrition
    addon => !addon.installedFile?.isAvailable
  )

  if (!ignoreArg) return new Set(ignoredByUnavaliable.map(addon => addon.addonID))

  const ignoring = (ignore as unknown as () => Ignore)().add(ignoreArg)
  const ignoredByDevonly = mci.installedAddons.filter(addon =>
    ignoring.ignores(`mods/${addon?.installedFile?.fileNameOnDisk}`)
  )

  return new Set(
    [...ignoredByDevonly, ...ignoredByUnavaliable].map(addon => addon.addonID)
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
export function loadMCInstanceFiltered(mci: Minecraftinstance, ignore?: IgnoreArgument): Minecraftinstance {
  const ignoredModIds = getIgnoredModIds(mci, ignore)
  return {
    ...mci,
    installedAddons: mci.installedAddons.filter(a => !ignoredModIds.has(a.addonID)),
  }
}

/**
 * Mods list that always present in mc instance
 * @internal
 */
export interface ModsUnion {
  /** Union of all mods in both instances */
  union: InstalledAddon[]
}

/**
 * Old and new addons
 * @internal
 */
export interface AddonDifference {
  now: InstalledAddon
  was: InstalledAddon
}

/**
 * Result of comparsion of two `minecraftinstance`s
 * @internal
 */
export interface ModsComparsion extends ModsUnion {
  /** Mods that exist in new instance, but absent in old */
  added?: InstalledAddon[]

  /** Intersection, mods that present in both instances */
  both?: InstalledAddon[]

  /** Mods that exist in old, but absent in new */
  removed?: InstalledAddon[]

  /** Array of mods with same ID but different versions */
  updated?: AddonDifference[]
}

/**
 * Collect the full set of addons from a single minecraftinstance, after
 * applying the same `.gitignore`-style filter as {@link modListDiff}.
 *
 * Use this when you don't have a previous instance to compare against.
 */
export function modListUnion(fresh: Minecraftinstance, ignore?: IgnoreArgument): ModsUnion {
  return { union: loadMCInstanceFiltered(fresh, ignore).installedAddons }
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
): ModsComparsion {
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
