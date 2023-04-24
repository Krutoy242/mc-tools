/**
 * @file Get mod data from CurseForge or hashed file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import CFV2 from 'curseforge-v2'

const { CFV2Client } = CFV2

/* ===========================
  Utils
=========================== */

export const loadText = (filename: string) => readFileSync(filename, 'utf8')
export const loadJson = (filename: string) => JSON.parse(loadText(filename))
export function saveText(txt: string, filename: string) {
  mkdirSync(dirname(filename), { recursive: true })
  writeFileSync(filename, txt)
}
export function saveObjAsJson(obj: any, filename: string) {
  saveText(JSON.stringify(obj, null, 2), filename)
}
// ===========================

const cachePath = '~cf_cache.json'

const cf = new CFV2Client({
  apiKey: loadText('secrets/~cf_api_key.txt').trim(),
})

type ModCached = CFV2.CF2Addon & { __lastUpdated?: number }

/**
 * Get mod information from CurseForge
 * If file was already fetched last `timeout` hours
 * it would be loaded from cache file
 * @param {number[]} modIds
 * @param {number} [timeout] hours of restoring from cache
 * @returns {Promise<CFV2.CF2Addon[]>}
 */
export async function fetchMods(modIds: number[], timeout = 96): Promise<CFV2.CF2Addon[]> {
  // Create file if not have one
  if (!existsSync(cachePath)) saveObjAsJson({}, cachePath)

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
  const cached: ModCached = loadJson(cachePath)[modID]
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

  const json = loadJson(cachePath)
  mods.forEach((mod) => {
    json[mod.id] = { __lastUpdated: Date.now(), ...mod }
  })
  saveObjAsJson(json, cachePath)

  return mods
}

