/**
 * @file Get mod data from CurseForge or hashed file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { existsSync } from 'node:fs'
import CFV2 from 'curseforge-v2'
import { readFileSync, readJsonSync, writeJsonSync } from 'fs-extra'

const { CFV2Client } = CFV2
// ===========================

const cachePath = '~cf_cache.json'

const cf = new CFV2Client({
  apiKey: readFileSync('secrets/~cf_api_key.txt', 'utf8').trim(),
})

type ModCached = CFV2.CF2Addon & { __lastUpdated?: number }

/**
 * Get mod information from CurseForge
 * If file was already fetched last `timeout` hours
 * it would be loaded from cache file
 * @param modIds
 * @param timeout hours of restoring from cache
 */
export async function fetchMods(modIds: number[], timeout = 96): Promise<CFV2.CF2Addon[]> {
  // Create file if not have one
  if (!existsSync(cachePath)) writeJsonSync(cachePath, {})

  const result: CFV2.CF2Addon[] = []
  const fromCFIds: number[] = []

  modIds.forEach((modID) => {
    const cached = cachedMod(modID, timeout)
    if (cached) result.push(cached)
    else fromCFIds.push(modID)
  })

  // return [...result, ...(await loadFromCF(fromCFIds))]
  const cfLoaded = await loadFromCF(fromCFIds)

  return modIds.map(
    id => result.find(a => a.id === id) ?? cfLoaded.find(a => a.id === id) as CFV2.CF2Addon
  )
}

/**
 * @param {number} modID
 * @param {number} timeout
 * @returns {CFV2.CF2Addon | undefined}
 */
function cachedMod(modID: number, timeout: number): CFV2.CF2Addon | undefined {
  const cached: ModCached = readJsonSync(cachePath)[modID]
  if (!cached) return

  const hoursPass
    = (Date.now() - (cached.__lastUpdated ?? 0)) / (1000 * 60 * 60)
  if (hoursPass > timeout) return

  const result = { ...cached }
  delete result.__lastUpdated
  return result
}

/**
 * @param {number[]} modIds
 * @returns {Promise<CFV2.CF2Addon[]>}
 */
async function loadFromCF(modIds: number[]): Promise<CFV2.CF2Addon[]> {
  if (!modIds.length) return []

  // Get from Web and update cache
  const mods = (await cf.getMods({ modIds })).data?.data

  if (!mods || !mods.length)
    throw new Error(`Cant fetch mods for IDs: ${modIds}`)

  const json = readJsonSync(cachePath)
  mods.forEach((mod) => {
    json[mod.id] = { __lastUpdated: Date.now(), ...mod }
  })
  writeJsonSync(json, cachePath)

  return mods
}

