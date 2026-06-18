import type { Ctx, Logger } from './types.js'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import chalk from 'chalk'
import { join, normalize } from 'pathe'
import { glob } from 'tinyglobby'
import { decompileMod } from './decompile.js'
import { ensureCorrectBranch, verifySourceFolder } from './git.js'
import { findAddon, findModJar, loadInstance } from './instance.js'
import { getIndexCache, resolveModId, sortCandidates, updateIndexCache } from './localCache.js'
import { makeLogger } from './log.js'
import {
  findRepoAndClone,
  findRepoFromJar,
  findRepoFromSameAuthorCF,
  findRepoViaGemini,
} from './resolve.js'

export { decompileMod } from './decompile.js'

export { readJarEntry, readJarManifest, readJarMcmodInfo } from './jar.js'
export type { Ctx, InstanceAddon, Logger, MinecraftInstance } from './types.js'

/** Default `MOD_SOURCES` location when neither option nor env var is set. */
const DEFAULT_MOD_SOURCES = 'e:/CODING_STATIC/mc/mod/'

export interface FindModSourceOptions {
  /** Directory holding cloned / decompiled mod sources. Default: `$MOD_SOURCES` or a built-in path. */
  modSources?: string
  /** Minecraft instance directory. Default: `process.cwd()`. */
  mcDir?     : string
  /** Suppress diagnostic logging (stdout result is unaffected). */
  silent?    : boolean
  /** Custom diagnostic sink. Overrides `silent`. */
  log?       : Logger
  /** CurseForge API key. Default: `$CF_API_KEY`. */
  cfApiKey?  : string
}

/** Build a {@link Ctx} from public options, applying env-var fallbacks. */
export function resolveContext(options: FindModSourceOptions = {}): Ctx {
  return {
    modSources: normalize(options.modSources ?? process.env.MOD_SOURCES ?? DEFAULT_MOD_SOURCES),
    mcDir     : normalize(options.mcDir ?? process.cwd()),
    cfApiKey  : options.cfApiKey ?? process.env.CF_API_KEY,
    log       : options.log ?? makeLogger(options.silent),
  }
}

/** Collect already-present local source folders matching `query`. */
async function findLocalCandidates(query: string, ctx: Ctx): Promise<string[]> {
  const candidates: string[] = []

  const directPath = join(ctx.modSources, query)
  if (existsSync(directPath)) {
    if (await verifySourceFolder(directPath, ctx.log)) candidates.push(directPath)
  }
  else {
    const matches = await glob(`${query}*`, { cwd: ctx.modSources, onlyDirectories: true })
    for (const folder of matches) {
      const p = join(ctx.modSources, folder)
      const modId = await resolveModId(p)
      if (modId?.toLowerCase() === query.toLowerCase() && await verifySourceFolder(p, ctx.log)) {
        candidates.push(p)
      }
    }
  }

  const indexPath = join(ctx.modSources, '.index.yaml')
  let cache = await getIndexCache(ctx.modSources, indexPath, ctx.log)
  const key = query.toLowerCase()
  if (!cache[key]?.length) cache = await updateIndexCache(ctx.modSources, indexPath, ctx.log)
  for (const folder of cache[key] ?? []) {
    const p = join(ctx.modSources, folder)
    if (await verifySourceFolder(p, ctx.log)) candidates.push(p)
    else ctx.log(chalk.yellow(`Cached folder '${p}' is invalid or missing.`))
  }

  return [...new Set(candidates)]
}

/**
 * Locate the source code of a Minecraft 1.12.2 mod. Resolution order:
 *   1. existing local folder / index cache (checked out to a 1.12 branch),
 *   2. clone from `minecraftinstance.json` / CurseForge,
 *   3. clone from jar metadata + GitHub search,
 *   4. clone from same-author repos / Gemini,
 *   5. decompile the jar.
 *
 * @returns absolute path to the source folder, or `null` if nothing resolved.
 */
export async function findModSource(query: string, options: FindModSourceOptions = {}): Promise<string | null> {
  const ctx = resolveContext(options)
  ctx.log(chalk.magenta(`Searching for mod sources for: ${query}`))

  if (!existsSync(ctx.modSources)) await fs.mkdir(ctx.modSources, { recursive: true })

  const indexPath = join(ctx.modSources, '.index.yaml')
  const reindex = async (path: string) => {
    await updateIndexCache(ctx.modSources, indexPath, ctx.log)
    return path
  }

  // 1. Local folders / index cache
  const candidates = await findLocalCandidates(query, ctx)
  for (const folder of await sortCandidates(candidates)) {
    if (await ensureCorrectBranch(folder, ctx.log)) {
      ctx.log(chalk.green(`Selected source folder: ${folder}`))
      return folder
    }
    ctx.log(chalk.yellow(`Skipping '${folder}' (branch checkout failed).`))
  }

  const instance = await loadInstance(ctx.mcDir)

  // 2. Clone from instance / CurseForge metadata
  if (instance) {
    const cloned = await findRepoAndClone(query, instance, ctx)
    if (cloned) return reindex(cloned)
  }
  else {
    ctx.log(chalk.red('minecraftinstance.json not found; skipping metadata-based resolution.'))
  }

  // 3. Jar metadata + GitHub search
  const jar = await findModJar(query, ctx.mcDir, instance)
  if (jar) {
    const fromJar = await findRepoFromJar(query, jar.jarPath, jar.displayName, ctx)
    if (fromJar) return reindex(fromJar)
  }

  // 4. Same-author (CF) + Gemini fallbacks
  if (instance) {
    const addon = findAddon(instance, query)
    if (addon) {
      const cfSameAuthor = await findRepoFromSameAuthorCF(addon, instance, query, ctx)
      if (cfSameAuthor) return reindex(cfSameAuthor)
      const gemini = await findRepoViaGemini(addon, ctx)
      if (gemini) return reindex(gemini)
    }
  }

  // 5. Decompile
  if (jar) {
    const decompiled = await decompileMod(jar.jarPath, jar.displayName, ctx)
    if (decompiled) return reindex(decompiled)
  }

  ctx.log(chalk.red('Failed to find or create source code folder.'))
  return null
}
