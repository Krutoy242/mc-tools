import type { InstanceAddon, MinecraftInstance } from './types.js'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { matchAddons } from '@mctools/utils/mod-resolve'
import { join } from 'pathe'
import { glob } from 'tinyglobby'
import { readJarMcmodInfo } from './jar.js'

/** Read and parse `minecraftinstance.json` from `mcDir`, or `null` if absent. */
export async function loadInstance(mcDir: string): Promise<MinecraftInstance | null> {
  const instPath = join(mcDir, 'minecraftinstance.json')
  if (!existsSync(instPath)) return null
  try {
    return JSON.parse(await fs.readFile(instPath, 'utf8')) as MinecraftInstance
  }
  catch {
    return null
  }
}

/**
 * Match an addon by id, name, or jar filename via the shared
 * `@mctools/utils/mod-resolve` ranker (best match wins).
 */
export function findAddon(instance: MinecraftInstance, query: string): InstanceAddon | undefined {
  return matchAddons(instance.installedAddons, query)[0]?.addon
}

/** Resolve the primary author name of an addon, if any. */
export function addonAuthor(addon: InstanceAddon): string | undefined {
  return addon.primaryAuthor || addon.authors?.[0]?.name || undefined
}

/**
 * Locate the `.jar` file for `query` inside `mcDir/mods`. First tries a direct
 * match in `minecraftinstance.json` (name/id/filename), then falls back to
 * scanning every jar's `mcmod.info` for a matching `modid`.
 */
export async function findModJar(
  query: string,
  mcDir: string,
  instance: MinecraftInstance | null
): Promise<{ jarPath: string, displayName: string } | null> {
  const modsDir = join(mcDir, 'mods')
  const q = query.toLowerCase()

  if (instance) {
    const addon = findAddon(instance, query)
    if (addon && existsSync(join(modsDir, addon.fileNameOnDisk))) {
      return { jarPath: join(modsDir, addon.fileNameOnDisk), displayName: addon.name }
    }
  }

  // Fallback: scan jars for a matching modid.
  const jars = await glob('*.jar', { cwd: modsDir })
  for (const file of jars) {
    const jarPath = join(modsDir, file)
    const entries = await readJarMcmodInfo(jarPath)
    if (entries.some(e => e.modid?.toLowerCase() === q)) {
      return { jarPath, displayName: entries[0]?.name || file.replace(/\.jar$/, '') }
    }
  }
  return null
}
