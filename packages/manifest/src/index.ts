/**
 * Functions for working with Minecraft's CurseForge manifest.json file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { ModpackManifest, ModpackManifestFile } from './manifest.js'

import { basename, resolve } from 'node:path'
import process from 'node:process'

import { fetchMods, loadMCInstanceFiltered } from '@mctools/curseforge'
import fse from 'fs-extra'

const { readFileSync, readJsonSync, writeFileSync, existsSync } = fse

const RE_COLON_NUM = /(":)(\d+)/g
const RE_NAME = /"___name":(".+?(?<!\\)")/g
const RE_BRACKET_OPEN = /\[\{/
const RE_BRACKET_CLOSE = /\}\]/
const RE_BRACE_COMMA = /\},\{/g
const RE_MC_VERSION = /for Minecraft (\d+\.\d+(?:\.\d+)?) loading/
const RE_DOT = /\./g

function formatModList(modsList: ModpackManifestFile[]) {
  return JSON.stringify(modsList)
    .replace(RE_COLON_NUM, (_m: string, r1: string, r2: string) => r1 + r2.padStart(6)) // Table aligning
    .replace(RE_NAME, (_m: string, r1: string) => `"___name":${r1.padEnd(42)}`) // Table aligning
    .replace(RE_BRACKET_OPEN, '[\n    {')
    .replace(RE_BRACKET_CLOSE, '}\n  ]')
    .replace(RE_BRACE_COMMA, '},\n    {')
}

export interface ManifestGenerationOptions {
  ignore?: string
  key    : string

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

  verbose?: boolean
}

/**
 * Try to autodetect the Minecraft version of the pack, in priority order:
 *   1. `gameVersion` field of `minecraftinstance.json`
 *   2. `baseModLoader.minecraftVersion` of `minecraftinstance.json`
 *   3. The "for Minecraft X.Y.Z loading" token in `logs/debug.log`
 */
function detectMcVersion(mci: { gameVersion?: string, baseModLoader?: { minecraftVersion?: string } }): string | undefined {
  if (mci.gameVersion) return mci.gameVersion
  if (mci.baseModLoader?.minecraftVersion) return mci.baseModLoader.minecraftVersion

  try {
    return readFileSync('logs/debug.log', 'utf8').match(RE_MC_VERSION)?.[1]
  }
  catch {
    return undefined
  }
}

/**
 * Try to read the Forge version from `logs/debug.log`.
 * Returns `undefined` if the log is missing or doesn't contain a Forge banner.
 */
function detectForgeVersion(mcVersion: string): string | undefined {
  try {
    const log = readFileSync('logs/debug.log', 'utf8')
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
    const existing = readJsonSync(manifestPath) as Partial<ModpackManifest>
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

export async function generateManifest(
  mcinstancePath = 'minecraftinstance.json',
  options: ManifestGenerationOptions
): Promise<ModpackManifest> {
  const manifestPath = `manifest${options.postfix ?? ''}.json`

  if (options.verbose) process.stdout.write('Determining version: ')
  const packVersion = options.packVersion ?? (() => {
    try {
      return (readJsonSync(manifestPath) as Partial<ModpackManifest>).version
    }
    catch { return undefined }
  })()
  if (options.verbose) process.stdout.write(`${packVersion || 'unknown'}\n`)

  if (options.verbose) process.stdout.write('Loading minecraftinstance.json ... ')
  const rawMci = readJsonSync(mcinstancePath) as Minecraftinstance
  const addonsListUnfiltered = loadMCInstanceFiltered(rawMci, options.ignore).installedAddons
  if (options.verbose) process.stdout.write(`loaded, ${addonsListUnfiltered.length} addons\n`)

  if (options.verbose) process.stdout.write('Loading mods meta from CurseForge ... ')
  const cfModsList = await fetchMods(addonsListUnfiltered.map(a => a.addonID), options.key, undefined, options.verbose)
  if (options.verbose) process.stdout.write('loaded\n')

  const modListUnfiltered: ModpackManifestFile[] = addonsListUnfiltered.map((a, i) => ({
    projectID  : a.addonID,
    fileID     : a.installedFile?.id,
    ___name    : cfModsList[i].name,
    downloadUrl: a.installedFile?.downloadUrl,
    required   : !a.installedFile?.fileNameOnDisk.endsWith('.jar.disabled'),
  }))

  const mcVersion = requireOrAbort(
    options.mcVersion ?? detectMcVersion(rawMci),
    'mc-version',
    'Minecraft version'
  )

  const projectID = requireOrAbort(
    options.projectID ?? detectProjectID(manifestPath),
    'project-id',
    'CurseForge project ID'
  )

  const name = requireOrAbort(
    options.name ?? basename(resolve('.')),
    'name',
    'pack name'
  )

  const forgeVersion = detectForgeVersion(mcVersion)
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

  const modList = modListUnfiltered
    .filter(m => m.required)
    .sort((a, b) => a.projectID - b.projectID)

  // Format beautifully
  const resultStr = JSON.stringify(resultObj, null, 2).replace(
    '  "files": []',
    `  "files": ${formatModList(modList)}`
  )
  writeFileSync(manifestPath, resultStr)

  resultObj.files = modList
  return resultObj
}
