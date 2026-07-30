import type { Logger } from './types.js'
import fs from 'node:fs/promises'
import { basename, join } from 'pathe'
import { glob } from 'tinyglobby'
import * as YAML from 'yaml'
import { getLatestCommitDate } from './git.js'

/** Maps lowercase modid → list of folder names under `modSources`. */
export type IndexCache = Record<string, string[]>

/** Key naming the mod id in a `gradle.properties`, in either casing style. */
const MODID_KEY = /(?:^|\n)[ \t]*mod_?id[ \t]*=[ \t]*(\S+)/i

/** Read a `key = value` pair out of a folder's `gradle.properties`. */
async function gradleProperty(dir: string, key: string | RegExp): Promise<string | undefined> {
  const re = typeof key === 'string'
    ? new RegExp(`(?:^|\\n)[ \\t]*${key}[ \\t]*=[ \\t]*(\\S+)`, 'i')
    : key
  try {
    return (await fs.readFile(join(dir, 'gradle.properties'), 'utf8')).match(re)?.[1]
  }
  catch {
    return undefined
  }
}

/**
 * The modid a `mcmod.info` entry really names. Cleanroom/RFG mods template
 * their metadata at build time (`"modid": "${mod_id}"`), so a checked-out
 * source tree only names the mod in its `gradle.properties`.
 */
async function resolveDeclaredModId(declared: string | undefined, dir: string): Promise<string | undefined> {
  if (!declared) return undefined
  if (!declared.includes('$')) return declared
  const key = declared.match(/^\$\{([\w.]+)\}$/)?.[1]
  return key ? gradleProperty(dir, key) : undefined
}

/**
 * Scan `modSources` for mod folders (via `mcmod.info` and GTNH-style
 * `gradle.properties`) and write a `modid → folders` index to `indexPath`.
 */
export async function updateIndexCache(modSources: string, indexPath: string, _log: Logger): Promise<IndexCache> {
  const cache: IndexCache = {}

  const add = (modid: string, folder: string) => {
    if (modid.includes('$')) return
    const key = modid.toLowerCase()
    ;(cache[key] ??= []).push(folder)
    cache[key] = [...new Set(cache[key])]
  }

  const metaFiles = await glob(
    ['*/src/main/resources/mcmod.info', '*/resources/mcmod.info', '*/mcmod.info'],
    { cwd: modSources }
  )
  for (const metaFile of metaFiles) {
    try {
      const json = JSON.parse(await fs.readFile(join(modSources, metaFile), 'utf8')) as
        | { modid?: string }[]
        | { modList?: { modid?: string }[] }
      const entries = Array.isArray(json) ? json : json.modList ?? []
      const folder = metaFile.split('/')[0]
      for (const entry of entries) {
        const modid = await resolveDeclaredModId(entry.modid, join(modSources, folder))
        if (modid) add(modid, folder)
      }
    }
    catch { /* ignore unparseable mcmod.info */ }
  }

  const propFiles = await glob('*/gradle.properties', { cwd: modSources })
  for (const propFile of propFiles) {
    const folder = propFile.split('/')[0]
    const modid = await gradleProperty(join(modSources, folder), MODID_KEY)
    if (modid) add(modid, folder)
  }

  await fs.writeFile(indexPath, YAML.stringify(cache), 'utf8')
  return cache
}

/** Load the index cache, rebuilding it if missing or unreadable. */
export async function getIndexCache(modSources: string, indexPath: string, log: Logger): Promise<IndexCache> {
  try {
    return (YAML.parse(await fs.readFile(indexPath, 'utf8')) as IndexCache | null) ?? {}
  }
  catch {
    return updateIndexCache(modSources, indexPath, log)
  }
}

/** Best-effort modid lookup for a source folder via metadata then Java/gradle. */
export async function resolveModId(folderPath: string): Promise<string | null> {
  for (const rel of ['src/main/resources/mcmod.info', 'resources/mcmod.info', 'mcmod.info']) {
    try {
      const json = JSON.parse(await fs.readFile(join(folderPath, rel), 'utf8')) as
        | { modid?: string }[]
        | { modList?: { modid?: string }[] }
      const entries = Array.isArray(json) ? json : json.modList ?? []
      for (const entry of entries) {
        const modid = await resolveDeclaredModId(entry.modid, folderPath)
        if (modid) return modid
      }
    }
    catch { /* try next */ }
  }

  try {
    const javaFiles = await glob('src/main/java/**/*.java', { cwd: folderPath })
    for (const javaFile of javaFiles.slice(0, 20)) {
      const match = (await fs.readFile(join(folderPath, javaFile), 'utf8')).match(/@Mod\s*\(\s*(?:modid\s*=\s*)?"([^"]+)"/)
      if (match) return match[1]
    }
  }
  catch { /* ignore */ }

  const fromGradle = await gradleProperty(folderPath, MODID_KEY)
  if (fromGradle) return fromGradle

  try {
    const text = await fs.readFile(join(folderPath, 'build.gradle'), 'utf8')
    const match = text.match(/archivesBaseName\s*=\s*['"]([^'"]+)['"]/)
    if (match) return match[1]
  }
  catch { /* ignore */ }

  return null
}

/**
 * Order candidate folders best-first: non-`-decompiled` over decompiled, then
 * by most recent git commit (folders without a commit date sort last).
 */
export async function sortCandidates(candidates: string[]): Promise<string[]> {
  if (candidates.length <= 1) return candidates
  const nonDecompiled = candidates.filter(p => !basename(p).endsWith('-decompiled'))
  const filtered = nonDecompiled.length > 0 ? nonDecompiled : candidates

  const withDates = await Promise.all(filtered.map(async p => ({ path: p, date: await getLatestCommitDate(p) })))
  withDates.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.getTime() - a.date.getTime()
  })
  return withDates.map(x => x.path)
}
