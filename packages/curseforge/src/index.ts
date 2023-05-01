/**
 * @file Get mod data from CurseForge or hashed file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import CFV2 from 'curseforge-v2'
import fse from 'fs-extra'
import type { Ignore } from 'ignore'
import ignore from 'ignore'

import type { InstalledAddon, RootObject } from './minecraftinstance'

const { readJsonSync, writeJsonSync } = fse

const { CFV2Client } = CFV2
// ===========================

type ModCached = CFV2.CF2Addon & { __lastUpdated?: number }

/**
 * Get mod information from CurseForge
 * If file was already fetched last `timeout` hours
 * it would be loaded from cache file
 * @param modIds
 * @param timeout hours of restoring from cache
 */
export async function fetchMods(modIds: number[], cfApiKey: string, timeout = 96, doLogging = false): Promise<CFV2.CF2Addon[]> {
  const result: CFV2.CF2Addon[] = []
  const fromCFIds: number[] = []

  const cachePath = '~cf_cache.json'
  const cacheObj: Record<number, ModCached> = readJsonSync(cachePath)

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

/**
 * @param {number} modID
 * @param {number} timeout
 * @returns {CFV2.CF2Addon | undefined}
 */
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

/**
 * @param {number[]} modIds
 * @returns {Promise<CFV2.CF2Addon[]>}
 */
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

function getIgnoredModIds(mciPath: string, ignoreArg?: IgnoreArgument) {
  const mci: RootObject = readJsonSync(mciPath)

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
 * Load minecraftinstance.json file from disk,
 * filter devonly mods and return typed
 */
export function loadMCInstanceFiltered(filePath: string, ignoreArg?: IgnoreArgument) {
  const mcinstance: RootObject = readJsonSync(filePath)
  const ignoredModIds = getIgnoredModIds(filePath, ignoreArg)

  mcinstance.installedAddons = mcinstance.installedAddons.filter(
    a => !ignoredModIds?.has(a.addonID)
  )

  return mcinstance
}

export interface ModsList {
  union: InstalledAddon[]
  both?: InstalledAddon[]
  added?: InstalledAddon[]
  removed?: InstalledAddon[]
  updated?: { was: InstalledAddon; now: InstalledAddon }[]
}

/**
 * Compare two minecraftinstance.json files and output differences between them
 */
export function modList(
  mcInstanceNew: string,
  mcInstancePathOld?: string,
  ignoreArg?: IgnoreArgument
): ModsList {
  const B = loadMCInstanceFiltered(mcInstanceNew, ignoreArg).installedAddons
  if (!mcInstancePathOld) return { union: B }

  const A = loadMCInstanceFiltered(mcInstancePathOld, ignoreArg).installedAddons

  const map_A = keyBy(A, 'addonID')
  const map_B = keyBy(B, 'addonID')
  const map_union = { ...map_A, ...map_B }

  const result = {
    union  : Object.values(map_union),
    both   : B.filter(o => map_A[o.addonID]),
    added  : B.filter(o => !map_A[o.addonID]),
    removed: A.filter(o => !map_B[o.addonID]),
    updated: B
      .filter(o => map_A[o.addonID] && map_A[o.addonID].installedFile?.id !== o.installedFile?.id)
      .map(o => ({ was: map_A[o.addonID], now: o })),
  }
  return result
}
