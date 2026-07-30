import type { Ctx, Logger } from './types.js'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import chalk from 'chalk'
import { join, normalize } from 'pathe'
import { glob } from 'tinyglobby'
import { decompileMod } from './decompile.js'
import { syncToInstalledVersion, verifySourceFolder } from './git.js'
import { findAddon, findModJar, getInstalledMod, loadInstance } from './instance.js'
import { getIndexCache, resolveModId, sortCandidates, updateIndexCache } from './localCache.js'
import { makeLogger } from './log.js'
import {
  findRepoAndClone,
  findRepoFromJar,
  findRepoFromSameAuthorCF,
  findRepoViaGemini,
} from './resolve.js'

export { decompileMod } from './decompile.js'

export { findModJar, getInstalledMod } from './instance.js'
export type { InstalledMod, ModJar } from './instance.js'
export { readJarEntry, readJarManifest, readJarMcmodInfo } from './jar.js'

export type { Ctx, InstanceAddon, Logger, MinecraftInstance } from './types.js'
export { readSourceVersion, versionFromFileName } from './version.js'
export type { SourceVersion } from './version.js'

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
    rejected  : new Set(),
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
  const instance = await loadInstance(ctx.mcDir)
  if (!instance) ctx.log(chalk.red('minecraftinstance.json not found; skipping metadata-based resolution.'))

  // Resolve the jar once: it decides which mod every later step works on, and
  // which version the resolved folder gets pinned to.
  const jar = await findModJar(query, ctx.mcDir, instance)
  const installed = jar ? await getInstalledMod(jar) : null
  if (installed) {
    const versions = installed.versions.join(' / ') || 'unknown version'
    ctx.log(chalk.gray(`Installed: ${installed.fileName} (${versions})`))
  }
  const installedVersions = installed?.versions ?? []

  /** Re-index a freshly created folder; clones are also pinned to the pack. */
  const reindex = async (path: string, sync = true) => {
    await updateIndexCache(ctx.modSources, indexPath, ctx.log)
    if (sync) await syncToInstalledVersion(path, installedVersions, ctx.log)
    return path
  }

  // 1. Local folders / index cache
  const candidates = await findLocalCandidates(query, ctx)
  for (const folder of await sortCandidates(candidates)) {
    if (await syncToInstalledVersion(folder, installedVersions, ctx.log)) return folder
    ctx.log(chalk.yellow(`Skipping '${folder}' (checkout failed).`))
  }

  // 2. Clone from instance / CurseForge metadata
  if (instance) {
    const cloned = await findRepoAndClone(query, instance, ctx, jar)
    if (cloned) return reindex(cloned)
  }

  // 3. Jar metadata + GitHub search
  if (jar) {
    const fromJar = await findRepoFromJar(query, jar.jarPath, jar.displayName, ctx)
    if (fromJar) return reindex(fromJar)
  }

  // 4. Same-author (CF) + Gemini fallbacks
  if (instance) {
    const addon = findAddon(instance, query, jar)
    if (addon) {
      const cfSameAuthor = await findRepoFromSameAuthorCF(addon, instance, query, ctx)
      if (cfSameAuthor) return reindex(cfSameAuthor)
      const gemini = await findRepoViaGemini(addon, ctx)
      if (gemini) return reindex(gemini)
    }
  }

  // 5. Decompile
  if (jar) {
    // Decompiled output already *is* the installed version — nothing to sync.
    const decompiled = await decompileMod(jar.jarPath, jar.displayName, ctx)
    if (decompiled) return reindex(decompiled, false)
  }

  ctx.log(chalk.red('Failed to find or create source code folder.'))
  return null
}
