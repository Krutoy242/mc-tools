import type { MatchReason } from '@mctools/utils/mod-resolve'
import type { InstanceAddon, MinecraftInstance } from './types.js'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { matchAddons } from '@mctools/utils/mod-resolve'
import { join } from 'pathe'
import { glob } from 'tinyglobby'
import { readJarMcmodInfo } from './jar.js'
import { normalizeVersion, versionFromFileName } from './version.js'

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
 * `@mctools/utils/mod-resolve` ranker (best match wins). Pass the jar
 * {@link findModJar} settled on to keep every later step on the same mod —
 * the ranker alone answers `jei` with `JEI Bees`, not `Had Enough Items`.
 */
export function findAddon(
  instance: MinecraftInstance,
  query: string,
  jar?: ModJar | null
): InstanceAddon | undefined {
  if (jar) {
    const fileName = jar.jarPath.split('/').pop()
    const owner = instance.installedAddons.find(a => a.fileNameOnDisk === fileName)
    if (owner) return owner
  }
  return matchAddons(instance.installedAddons, query)[0]?.addon
}

/** Resolve the primary author name of an addon, if any. */
export function addonAuthor(addon: InstanceAddon): string | undefined {
  return addon.primaryAuthor || addon.authors?.[0]?.name || undefined
}

/**
 * Match reasons that identify an addon precisely. `minecraftinstance.json`
 * carries no `modid`, so a query that is one can only ever match an addon as a
 * name/file fragment — which must not outrank a jar declaring that very modid.
 */
const EXACT_REASONS = new Set<MatchReason>(['id', 'name-exact', 'file-exact', 'name-canon', 'file-canon'])

/** How many jars are opened at once while hunting for a modid. */
const JAR_SCAN_CONCURRENCY = 16

/** The jar backing a query, plus the `modid` it turned out to declare. */
export interface ModJar {
  jarPath    : string
  displayName: string
  /** `modid` from the jar's `mcmod.info`; absent when it declares none. */
  modid?     : string
}

/** `modid` a jar declares, ignoring unsubstituted build placeholders. */
async function jarModId(jarPath: string): Promise<string | undefined> {
  const entries = await readJarMcmodInfo(jarPath)
  return entries.find(e => e.modid && !e.modid.includes('$'))?.modid
}

/** Scan every jar in `modsDir` for one whose `mcmod.info` declares `modid`. */
async function findJarByModId(modid: string, modsDir: string): Promise<ModJar | null> {
  const q = modid.toLowerCase()
  const jars = await glob('*.jar', { cwd: modsDir })

  for (let i = 0; i < jars.length; i += JAR_SCAN_CONCURRENCY) {
    const batch = await Promise.all(jars.slice(i, i + JAR_SCAN_CONCURRENCY).map(async (file) => {
      const jarPath = join(modsDir, file)
      const entries = await readJarMcmodInfo(jarPath)
      const entry = entries.find(e => e.modid?.toLowerCase() === q)
      if (!entry) return null
      return {
        jarPath,
        displayName: entry.name || entries[0]?.name || file.replace(/\.jar$/, ''),
        modid      : entry.modid,
      }
    }))
    const hit = batch.find(Boolean)
    if (hit) return hit
  }
  return null
}

/**
 * Locate the `.jar` file for `query` inside `mcDir/mods`. An exact
 * `minecraftinstance.json` match (id / verbatim name / verbatim filename) wins
 * outright; otherwise a jar declaring `query` as its `modid` is preferred over
 * a mere name fragment, which would happily answer `jei` with `JEI Bees`.
 */
export async function findModJar(
  query: string,
  mcDir: string,
  instance: MinecraftInstance | null
): Promise<ModJar | null> {
  const modsDir = join(mcDir, 'mods')
  const match = instance ? matchAddons(instance.installedAddons, query)[0] : undefined
  const isExact = Boolean(match && EXACT_REASONS.has(match.reason))

  if (!isExact) {
    const byModId = await findJarByModId(query, modsDir)
    if (byModId) return byModId
  }

  const addon = match?.addon
  if (addon && existsSync(join(modsDir, addon.fileNameOnDisk))) {
    const jarPath = join(modsDir, addon.fileNameOnDisk)
    return { jarPath, displayName: addon.name, modid: await jarModId(jarPath) }
  }
  return null
}

/** What the pack actually ships for a mod, used to pin the sources to it. */
export interface InstalledMod {
  /** Jar file name as present in `mods/`. */
  fileName: string
  /**
   * Candidate version strings, best guess first: the one encoded in the jar
   * file name, then the one `mcmod.info` declares (they can disagree when a
   * build bumps its number after the metadata is written).
   */
  versions: string[]
}

/** Which version of an already-located jar the pack ships. */
export async function getInstalledMod(jar: ModJar): Promise<InstalledMod> {
  const fileName = jar.jarPath.split('/').pop() ?? jar.jarPath
  const versions = new Set<string>()

  const fromName = versionFromFileName(fileName)
  if (fromName) versions.add(fromName)

  const q = jar.modid?.toLowerCase()
  const entries = await readJarMcmodInfo(jar.jarPath)
  const entry = entries.find(e => e.modid?.toLowerCase() === q) ?? entries[0]
  if (entry?.version && !entry.version.includes('$')) versions.add(normalizeVersion(entry.version))

  return { fileName, versions: [...versions] }
}
