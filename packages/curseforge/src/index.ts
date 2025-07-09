/**
 * @file Get mod data from CurseForge or hashed file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import type { Ignore } from 'ignore'

import process from 'node:process'

import CFV2 from 'curseforge-v2'
import fse from 'fs-extra'
import ignore from 'ignore'

import type { InstalledAddon, Minecraftinstance } from './minecraftinstance'

const { readJsonSync, writeJsonSync } = fse
const { CFV2Client } = CFV2
type ModCached = CFV2.CF2Addon & { __lastUpdated?: number }

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

  const cachePath = '~cf_cache.json'
  let cacheObj: Record<number, ModCached>

  try {
    cacheObj = readJsonSync(cachePath)
  }
  // eslint-disable-next-line unused-imports/no-unused-vars
  catch (error) {
    cacheObj = {}
  }

  modIds.forEach((modID) => {
    const cached = cachedMod(cacheObj[modID], timeout)
    if (cached) result.push(cached)
    else fromCFIds.push(modID)
  })
  if (doLogging) process.stdout.write(`Found cached mods: ${result.length} `)

  const cfLoaded = await loadFromCF(fromCFIds, cfApiKey)

  // Update cached values
  cfLoaded.forEach((mod) => {
    cacheObj[mod.id] = { __lastUpdated: Date.now(), ...mod }
  })
  if (cfLoaded.length) writeJsonSync(cachePath, cacheObj)

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

let cf: CFV2.CFV2Client

async function loadFromCF(modIds: number[], cfApiKey: string): Promise<CFV2.CF2Addon[]> {
  if (!modIds.length) return []

  // Get from Web and update cache
  const mods = (await (cf ??= new CFV2Client({
    apiKey: cfApiKey,
  })).getMods({ modIds })).data?.data

  if (!mods || !mods.length)
    throw new Error(`Cant fetch mods for IDs: ${modIds}`)

  return mods
}

function keyBy<T extends { [key: string]: any }>(arr: T[], key: keyof T) {
  const result = {} as { [key: number]: T }
  arr.forEach(o => result[o[key]] = o)
  return result
}

type IgnoreArgument = Parameters<Ignore['add']>[0]

function getIgnoredModIds(mci: Minecraftinstance, ignoreArg?: IgnoreArgument) {
  const ignoredByUnavaliable = mci.installedAddons.filter(
    // Unavailable like Optifine or Nutrition
    addon => !addon.installedFile?.isAvailable
  )

  if (!ignoreArg) return new Set(ignoredByUnavaliable.map(addon => addon.addonID))

  const ignoring = ignore().add(ignoreArg)
  const ignoredByDevonly = mci.installedAddons.filter(addon =>
    ignoring.ignores(`mods/${addon?.fileNameOnDisk}`)
  )

  return new Set(
    [...ignoredByDevonly, ...ignoredByUnavaliable].map(addon => addon.addonID)
  )
}

/**
 * Load minecraftinstance.json file from disk, filtering unavailable or ignored mods
 * @param mci Json object of `minecraftinstance.json`
 * @param ignore .gitignore-like file content with mods to ignore.
 *
 * For example, `ignore` contains 3 lines:
 * ```ts
 * const mci = loadMCInstanceFiltered(mciPath, `
 *   scripts/debug
 *   config/FBP/*
 *   mods/tellme-*
 * `)
 * ```
 * Since it have line `mods/tellme-*` in it, mod `tellme-1.12.2-0.7.0.jar` would be removed from result.
 * @returns Same `minecraftinstance` object but without unavailable on CF mods like Optifine or Nutrition.
 */
export function loadMCInstanceFiltered(mci: Minecraftinstance, ignore?: IgnoreArgument) {
  const ignoredModIds = getIgnoredModIds(mci, ignore)

  mci.installedAddons = mci.installedAddons.filter(
    a => !ignoredModIds?.has(a.addonID)
  )

  return mci
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

  // /** Array of mods with same file ID but different file sizes */
  // changed?: AddonDifference[]

  /** Mods that exist in old, but absent in new */
  removed?: InstalledAddon[]

  /** Array of mods with same ID but different versions */
  updated?: AddonDifference[]
}

/**
 * Compare two minecraftinstance.json files and output differences between them
 * @param fresh Json object from `minecraftinstance.json` of current version
 * @param old   Json object from `minecraftinstance.json` of previous version.
 * @param ignore .gitignore-like file content with mods to ignore.
 * Useful for dev-only mods that should not be included in result.
 * @returns Result of comparsion.
 * if `old` is omited, returns only `union` field.
 */
// export function modList<T extends Minecraftinstance | undefined = undefined>(
//   fresh: Minecraftinstance,
//   old?: T,
//   ignore?: IgnoreArgument
// ): T extends undefined ? { union: InstalledAddon[] } : ModsComparsion {
export function modList(fresh: Minecraftinstance, old?: undefined, ignore?: IgnoreArgument): ModsUnion
export function modList(fresh: Minecraftinstance, old?: Minecraftinstance, ignore?: IgnoreArgument): ModsComparsion
export function modList(fresh: Minecraftinstance, old?: Minecraftinstance | undefined, ignore?: IgnoreArgument): ModsComparsion | ModsUnion {
  const B = loadMCInstanceFiltered(fresh, ignore).installedAddons
  if (!old) return { union: B }

  const A = loadMCInstanceFiltered(old, ignore).installedAddons

  const map_A = keyBy(A, 'addonID')
  const map_B = keyBy(B, 'addonID')
  const map_union = { ...map_A, ...map_B }

  const result: ModsComparsion = {
    union  : Object.values(map_union),
    both   : B.filter(o => map_A[o.addonID]),
    added  : B.filter(o => !map_A[o.addonID]),
    removed: A.filter(o => !map_B[o.addonID]),
  }

  result.updated = result.both
    ?.filter(o => map_A[o.addonID].installedFile?.id !== o.installedFile?.id)
    .map(o => ({ now: o, was: map_A[o.addonID] }))

  // result.changed = result.both
  //   ?.filter((old) => {
  //     const fresh = map_A[old.addonID]
  //     return fresh.installedFile?.id === old.installedFile?.id
  //       && (
  //         fresh.installedFile?.fileLength !== old.installedFile?.fileLength
  //         || fresh.installedFile?.fileNameOnDisk !== old.installedFile?.fileNameOnDisk
  //       )
  //   })
  //   .map(o => ({ now: o, was: map_A[o.addonID] }))

  return result
}

/*
const a = modList({} as any)
const b = modList({} as any, {} as Minecraftinstance)
const c = modList({} as any, undefined)
 */
