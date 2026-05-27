import type CFV2 from 'curseforge-v2'
import process from 'node:process'
import { cachedMod, readCache, writeCache } from './cache.js'
import { getClient } from './client.js'

export async function loadFromCF(modIds: number[], cfApiKey: string): Promise<CFV2.CF2Addon[]> {
  if (!modIds.length) return []

  const mods = (await getClient(cfApiKey).getMods({ modIds })).data?.data

  if (!mods?.length)
    throw new Error(`Cant fetch mods for IDs: ${modIds.join(', ')}`)

  return mods
}

/**
 * Get mod information from CurseForge, such as name, summary, download count, etc.
 * @param modIds IDs of mods you want to fetch. `[32274, 59751, 59816]`
 * @param cfApiKey CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys
 * @param timeout If file was already fetched last `timeout` hours, it would be loaded from cache file
 * @param doLogging Log into stdout
 * @returns Object with information about mods
 */
export async function fetchMods(
  modIds: number[],
  cfApiKey: string,
  timeout = 96,
  doLogging = false
): Promise<CFV2.CF2Addon[]> {
  const cacheObj = readCache()
  const result: CFV2.CF2Addon[] = []
  const fromCFIds: number[] = []

  for (const modID of modIds) {
    const cached = cachedMod(cacheObj[modID], timeout)
    if (cached) result.push(cached)
    else fromCFIds.push(modID)
  }

  if (doLogging) process.stdout.write(`Found cached mods: ${result.length} `)

  const cfLoaded = await loadFromCF(fromCFIds, cfApiKey)
  for (const mod of cfLoaded) {
    cacheObj[mod.id] = { __lastUpdated: Date.now(), ...mod }
  }

  if (cfLoaded.length) writeCache(cacheObj)

  return modIds.map(
    id => result.find(a => a.id === id) ?? cfLoaded.find(a => a.id === id) as CFV2.CF2Addon
  )
}

/**
 * Fetch a single mod from CurseForge.
 * @param modId ID of the mod to fetch
 * @param cfApiKey CurseForge API key
 * @param timeout Cache timeout in hours
 * @param doLogging Log into stdout
 */
export async function fetchMod(
  modId: number,
  cfApiKey: string,
  timeout = 96,
  doLogging = false
): Promise<CFV2.CF2Addon> {
  const mods = await fetchMods([modId], cfApiKey, timeout, doLogging)
  return mods[0]
}
