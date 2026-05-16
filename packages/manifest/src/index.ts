/**
 * Functions for working with Minecraft's CurseForge manifest.json file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import type { InstalledAddon, Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { ModpackManifest, ModpackManifestFile } from './manifest.js'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { fetchMods, loadMCInstanceFiltered } from '@mctools/curseforge'

export type { ModpackManifest, ModpackManifestFile }

const RE_COLON_NUM = /(":)(\d+)/g
const RE_NAME = /"___name":(".+?(?<!\\)")/g
const RE_BRACKET_OPEN = /\[\{/
const RE_BRACKET_CLOSE = /\}\]/
const RE_BRACE_COMMA = /\},\{/g
const RE_MC_VERSION = /for Minecraft (\d+\.\d+(?:\.\d+)?) loading/
const RE_DOT = /\./g

export function formatModList(modsList: ModpackManifestFile[]) {
  return JSON.stringify(modsList)
    .replace(RE_COLON_NUM, (_m: string, r1: string, r2: string) => r1 + r2.padStart(6)) // Table aligning
    .replace(RE_NAME, (_m: string, r1: string) => `"___name":${r1.padEnd(42)}`) // Table aligning
    .replace(RE_BRACKET_OPEN, '[\n    {')
    .replace(RE_BRACKET_CLOSE, '}\n  ]')
    .replace(RE_BRACE_COMMA, '},\n    {')
}

export interface ManifestGenerationOptions {
  mcinstancePath?: string
  ignore?        : string
  key            : string

  /** Override: pack name (falls back to cwd directory name). */
  name?: string

  /** Override: Minecraft version (falls back to `minecraftinstance.json` → `debug.log`). */
  mcVersion?: string

  /** Override: CurseForge project ID (falls back to existing `manifest.json`). */
  projectID?: number

  /** Version of the pack that would be written into manifest file */
  packVersion?: string

  /** manifest[postfix].json */
  postfix?: string

  /** Working directory for resolving relative paths (default: `process.cwd()`). */
  cwd?: string

  verbose?: boolean

  /** Optional log callback. If omitted, verbose does nothing. */
  onLog?: (msg: string) => void
}

/**
 * Convert an InstalledAddon into a ModpackManifestFile entry.
 */
function addonToManifestFile(addon: InstalledAddon, cfName?: string): ModpackManifestFile {
  return {
    projectID  : addon.addonID,
    fileID     : addon.installedFile?.id ?? 0,
    ___name    : cfName ?? addon.name,
    downloadUrl: addon.installedFile?.downloadUrl,
    required   : !addon.installedFile?.fileNameOnDisk.endsWith('.jar.disabled'),
  }
}

/**
 * Filter out optional mods, sort by projectID, and enforce a stable field order.
 */
function buildSortedModList(files: ModpackManifestFile[]): ModpackManifestFile[] {
  return files
    .filter(m => m.required)
    .sort((a, b) => a.projectID - b.projectID)
    .map(m => ({
      projectID  : m.projectID,
      fileID     : m.fileID,
      ___name    : m.___name,
      downloadUrl: m.downloadUrl,
      required   : m.required,
    }))
}

/**
 * Serialize manifest with beautiful file list formatting and write to disk.
 */
function writeManifestToDisk(
  manifestPath: string,
  manifest: ModpackManifest,
  files: ModpackManifestFile[]
): void {
  // Temporarily clear files so JSON.stringify emits the exact placeholder we replace
  const originalFiles = manifest.files
  manifest.files = []
  const resultStr = JSON.stringify(manifest, null, 2).replace(
    '  "files": []',
    `  "files": ${formatModList(files)}`
  )
  manifest.files = originalFiles
  writeFileSync(manifestPath, resultStr)
}

/**
 * Try to autodetect the Minecraft version of the pack, in priority order:
 *   1. `gameVersion` field of `minecraftinstance.json`
 *   2. `baseModLoader.minecraftVersion` of `minecraftinstance.json`
 *   3. The "for Minecraft X.Y.Z loading" token in `logs/debug.log`
 */
function detectMcVersion(
  mci: { gameVersion?: string, baseModLoader?: { minecraftVersion?: string } },
  cwd = '.'
): string | undefined {
  if (mci.gameVersion) return mci.gameVersion
  if (mci.baseModLoader?.minecraftVersion) return mci.baseModLoader.minecraftVersion

  try {
    return readFileSync(resolve(cwd, 'logs/debug.log'), 'utf8').match(RE_MC_VERSION)?.[1]
  }
  catch {
    return undefined
  }
}

/**
 * Try to read the Forge version from `logs/debug.log`.
 * Returns `undefined` if the log is missing or doesn't contain a Forge banner.
 */
function detectForgeVersion(mcVersion: string, cwd = '.'): string | undefined {
  try {
    const log = readFileSync(resolve(cwd, 'logs/debug.log'), 'utf8')
    const raw = log.match(new RegExp(`Forge Mod Loader version (\\S+) for Minecraft ${mcVersion.replace(RE_DOT, '\\.')} loading`))?.[1]
    return raw && !raw.endsWith('.0') ? raw : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Try to read the last-known `projectID` from a manifest.json next to cwd.
 */
function detectProjectID(manifestPath: string): number | undefined {
  if (!existsSync(manifestPath)) return undefined
  try {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<ModpackManifest>
    return typeof existing.projectID === 'number' ? existing.projectID : undefined
  }
  catch {
    return undefined
  }
}

function requireOrAbort<T>(value: T | undefined, flag: string, hint: string): T {
  if (value !== undefined && value !== '') return value
  throw new Error(
    `Cannot determine ${hint}. `
    + `Autodetect failed — please provide it explicitly via the \`--${flag}\` flag.`
  )
}

export function incrementalUpdateManifest(
  manifestPath: string,
  fresh: Minecraftinstance
): void {
  if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`)

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ModpackManifest
  const freshMap = new Map<number, InstalledAddon>(fresh.installedAddons.map(a => [a.addonID, a]))

  // Remove deleted
  manifest.files = manifest.files.filter(f => freshMap.has(f.projectID))

  // Update changed / add new
  for (const [addonID, addon] of freshMap) {
    const existingIdx = manifest.files.findIndex(f => f.projectID === addonID)
    const entry = addonToManifestFile(addon)
    if (existingIdx >= 0) {
      manifest.files[existingIdx] = entry
    }
    else {
      manifest.files.push(entry)
    }
  }

  const modList = buildSortedModList(manifest.files)
  writeManifestToDisk(manifestPath, manifest, modList)
}

export async function generateManifest(
  options: ManifestGenerationOptions
): Promise<ModpackManifest> {
  const mcinstancePath = options.mcinstancePath ?? 'minecraftinstance.json'
  const cwd = resolve(options.cwd ?? '.')
  const manifestPath = resolve(cwd, `manifest${options.postfix ?? ''}.json`)

  options.onLog?.('Determining version: ')
  const packVersion = options.packVersion ?? (() => {
    try {
      return (JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<ModpackManifest>).version
    }
    catch { return undefined }
  })()
  options.onLog?.(`${packVersion || 'unknown'}\n`)

  options.onLog?.('Loading minecraftinstance.json ... ')
  const rawMci = JSON.parse(readFileSync(mcinstancePath, 'utf-8')) as Minecraftinstance
  const addonsListUnfiltered = loadMCInstanceFiltered(rawMci, options.ignore).installedAddons
  options.onLog?.(`loaded, ${addonsListUnfiltered.length} addons\n`)

  options.onLog?.('Loading mods meta from CurseForge ... ')
  const cfModsList = await fetchMods(addonsListUnfiltered.map(a => a.addonID), options.key, undefined, options.verbose)
  options.onLog?.('loaded\n')

  const modListUnfiltered = addonsListUnfiltered.map((a, i) => addonToManifestFile(a, cfModsList[i].name))

  const mcVersion = requireOrAbort(
    options.mcVersion ?? detectMcVersion(rawMci, cwd),
    'mc-version',
    'Minecraft version'
  )

  const projectID = requireOrAbort(
    options.projectID ?? detectProjectID(manifestPath),
    'project-id',
    'CurseForge project ID'
  )

  const name = requireOrAbort(
    options.name ?? basename(cwd),
    'name',
    'pack name'
  )

  const forgeVersion = detectForgeVersion(mcVersion, cwd)
  const modLoaderId = forgeVersion ? `forge-${forgeVersion}` : undefined

  const resultObj: ModpackManifest = {
    minecraft: {
      version   : mcVersion,
      modLoaders: modLoaderId ? [{ id: modLoaderId, primary: true }] : [],
    },
    projectID,
    manifestType   : 'minecraftModpack',
    manifestVersion: 1,
    name,
    version        : packVersion ?? '',
    author         : rawMci.customAuthor || 'unknown',
    overrides      : 'overrides',
    files          : [],
  }

  const modList = buildSortedModList(modListUnfiltered)
  writeManifestToDisk(manifestPath, resultObj, modList)

  resultObj.files = modList
  return resultObj
}
