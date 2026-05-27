import type CFV2 from 'curseforge-v2'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'

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

export function readCache(): Record<number, ModCached> {
  try {
    return fse.readJsonSync(getCachePath()) as Record<number, ModCached>
  }
  catch {
    return {}
  }
}

export function writeCache(cache: Record<number, ModCached>): void {
  const cachePath = getCachePath()
  fse.mkdirpSync(join(cachePath, '..'))
  fse.writeJsonSync(cachePath, cache)
}

export function cachedMod(cached: ModCached, timeout: number): CFV2.CF2Addon | undefined {
  if (!cached) return

  const hoursPass = (Date.now() - (cached.__lastUpdated ?? 0)) / (1000 * 60 * 60)
  if (hoursPass > timeout) return

  const { __lastUpdated: _, ...rest } = cached
  return rest
}
