import type CFV2 from 'curseforge-v2'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { cachedMod, readCache, writeCache } from './cache.js'
import { getClient } from './client.js'

/** How many mod IDs are sent in one `getMods` request. CF answers 502 on huge payloads. */
const CHUNK_SIZE = 200

/** Attempts per chunk before giving up. CF sporadically answers 502 / resets the connection. */
const ATTEMPTS = 3

/** Base backoff between attempts, doubled each retry. */
const RETRY_DELAY_MS = 500

/** Shorten a long ID list so a failure doesn't print a screen-wide wall of numbers. */
function briefIds(ids: number[], shown = 5): string {
  return ids.length <= shown
    ? ids.join(', ')
    : `${ids.slice(0, shown).join(', ')} … and ${ids.length - shown} more`
}

async function loadChunk(modIds: number[], cfApiKey: string): Promise<CFV2.CF2Addon[]> {
  let reason = 'unknown error'

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await delay(RETRY_DELAY_MS * 2 ** (attempt - 2))

    let response
    try {
      response = await getClient(cfApiKey).getMods({ modIds })
    }
    catch (error) {
      reason = error instanceof Error ? error.message : String(error)
      continue
    }

    const mods = response.data?.data
    if (mods?.length) return mods

    // Server answered properly but knows nothing about these mods — retrying won't help
    if (response.statusCode === 200)
      throw new Error(`CurseForge returned no mods for ${modIds.length} IDs: ${briefIds(modIds)}`)

    reason = `HTTP ${response.statusCode} ${response.message}`
  }

  throw new Error(`Cant fetch ${modIds.length} mods after ${ATTEMPTS} attempts (${reason}). IDs: ${briefIds(modIds)}`)
}

export async function loadFromCF(modIds: number[], cfApiKey: string): Promise<CFV2.CF2Addon[]> {
  if (!modIds.length) return []

  const result: CFV2.CF2Addon[] = []
  for (let i = 0; i < modIds.length; i += CHUNK_SIZE)
    result.push(...await loadChunk(modIds.slice(i, i + CHUNK_SIZE), cfApiKey))

  return result
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

  let cfLoaded: CFV2.CF2Addon[] = []
  let stale: CFV2.CF2Addon[] = []
  try {
    cfLoaded = await loadFromCF(fromCFIds, cfApiKey)
  }
  catch (error) {
    // Rather than failing the whole run on a flaky API, reuse outdated cache entries.
    // They keep their old timestamp, so the next run tries CurseForge again.
    if (fromCFIds.some(id => !cacheObj[id])) throw error

    stale = fromCFIds.map(id => cachedMod(cacheObj[id], Number.POSITIVE_INFINITY)!)
    process.stderr.write(`\nCurseForge unreachable, reusing outdated cache for ${stale.length} mods (${(error as Error).message})\n`)
  }

  for (const mod of cfLoaded) {
    cacheObj[mod.id] = { __lastUpdated: Date.now(), ...mod }
  }

  if (cfLoaded.length) writeCache(cacheObj)

  const fetched = cfLoaded.length ? cfLoaded : stale

  return modIds.map(
    id => result.find(a => a.id === id) ?? fetched.find(a => a.id === id) as CFV2.CF2Addon
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
