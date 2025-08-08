/**
 * Functions for working with Minecraft's CurseForge manifest.json file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { fetchMods, loadMCInstanceFiltered } from '@mctools/curseforge'
import fse from 'fs-extra'

import type { ModpackManifest, ModpackManifestFile } from './manifest'

const { readFileSync, readJsonSync, writeFileSync } = fse

// "test string": "test string \"inside\" "

function formatModList(modsList: ModpackManifestFile[]) {
  return JSON.stringify(modsList)
    .replace(/(":)(\d+)/g, (m, r1, r2) => r1 + r2.padStart(6)) // Table aligning
    .replace(/"___name":(".+?(?<!\\)")/g, (m, r1) => `"___name":${r1.padEnd(42)}`) // Table aligning
    .replace(/\[\{/, '[\n    {')
    .replace(/\}\]/, '}\n  ]')
    .replace(/\},\{/g, '},\n    {') // new lines
}

export interface ManifestGenerationOptions {
  ignore?     : string
  key         : string
  /** Version of the pack that would be written into manifest file */
  packVersion?: string

  /** manifest[postfix].json */
  postfix?: string

  verbose?: boolean
}

export async function generateManifest(
  mcinstancePath = 'minecraftinstance.json',
  options: ManifestGenerationOptions
): Promise<{ [key: string]: any }> {
  if (options.verbose) process.stdout.write('Determining version: ')
  const manifestPath = `manifest${options.postfix ?? ''}.json`
  if (!options.packVersion) {
    try {
      options.packVersion = readJsonSync(manifestPath).version
    }
    catch (error) {}
  }
  if (options.verbose) process.stdout.write(`${options.packVersion || 'unknown'}\n`)

  if (options.verbose) process.stdout.write('Loading minecraftinstance.json ... ')
  const addonsListUnfiltered = loadMCInstanceFiltered(readJsonSync(mcinstancePath), options.ignore).installedAddons
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

  const forgeVersion = readFileSync('logs/debug.log', 'utf8').match(
    /Forge Mod Loader version (\S+) for Minecraft 1.12.2 loading/
  )?.[1]

  const resultObj: ModpackManifest = {
    minecraft: {
      version   : '1.12.2',
      modLoaders: [
        {
          id     : `forge-${!forgeVersion || forgeVersion?.endsWith('.0') ? '14.23.5.2860' : forgeVersion}`,
          primary: true,
        },
      ],
    },
    projectID      : 561105,
    manifestType   : 'minecraftModpack',
    manifestVersion: 1,
    name           : 'Enigmatica2Expert-Extended',
    version        : options.packVersion ?? '',
    author         : 'krutoy242',
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
