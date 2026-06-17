import type { Logger } from './types.js'
import fs from 'node:fs/promises'
import chalk from 'chalk'
import glob from 'fast-glob'
import { basename, join } from 'pathe'
import * as YAML from 'yaml'
import { getLatestCommitDate } from './git.js'

/** Maps lowercase modid → list of folder names under `modSources`. */
export type IndexCache = Record<string, string[]>

/**
 * Scan `modSources` for mod folders (via `mcmod.info` and GTNH-style
 * `gradle.properties`) and write a `modid → folders` index to `indexPath`.
 */
export async function updateIndexCache(modSources: string, indexPath: string, log: Logger): Promise<IndexCache> {
  log(chalk.cyan('Indexing MOD_SOURCES to find mod folders...'))
  const cache: IndexCache = {}

  const add = (modid: string, folder: string) => {
    if (modid.includes('$')) return
    const key = modid.toLowerCase()
    ;(cache[key] ??= []).push(folder)
    cache[key] = [...new Set(cache[key])]
  }

  const metaFiles = await glob(
    ['*/src/main/resources/mcmod.info', '*/resources/mcmod.info', '*/mcmod.info'],
    { cwd: modSources, suppressErrors: true }
  )
  for (const metaFile of metaFiles) {
    try {
      const json = JSON.parse(await fs.readFile(join(modSources, metaFile), 'utf8')) as
        | { modid?: string }[]
        | { modList?: { modid?: string }[] }
      const entries = Array.isArray(json) ? json : json.modList ?? []
      const folder = metaFile.split('/')[0]
      for (const entry of entries) {
        if (entry.modid) add(entry.modid, folder)
      }
    }
    catch { /* ignore unparseable mcmod.info */ }
  }

  const propFiles = await glob('*/gradle.properties', { cwd: modSources, suppressErrors: true })
  for (const propFile of propFiles) {
    try {
      const match = (await fs.readFile(join(modSources, propFile), 'utf8')).match(/(?:^|\n)\s*modId\s*=\s*(\S+)/)
      if (match) add(match[1], propFile.split('/')[0])
    }
    catch { /* ignore */ }
  }

  await fs.writeFile(indexPath, YAML.stringify(cache), 'utf8')
  log(chalk.green(`Indexed ${Object.keys(cache).length} mod IDs.`))
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
        if (entry.modid && !entry.modid.includes('$')) return entry.modid
      }
    }
    catch { /* try next */ }
  }

  try {
    const javaFiles = await glob('src/main/java/**/*.java', { cwd: folderPath, suppressErrors: true })
    for (const javaFile of javaFiles.slice(0, 20)) {
      const match = (await fs.readFile(join(folderPath, javaFile), 'utf8')).match(/@Mod\s*\(\s*(?:modid\s*=\s*)?"([^"]+)"/)
      if (match) return match[1]
    }
  }
  catch { /* ignore */ }

  for (const [file, re] of [
    ['gradle.properties', /(?:^|\n)\s*modId\s*=\s*(\S+)/],
    ['build.gradle', /archivesBaseName\s*=\s*['"]([^'"]+)['"]/],
  ] as const) {
    try {
      const match = (await fs.readFile(join(folderPath, file), 'utf8')).match(re)
      if (match) return match[1]
    }
    catch { /* ignore */ }
  }

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
