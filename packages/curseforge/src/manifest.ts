/**
 * @file Functions for working with Minecraft's CurseForge manifest.json file
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */
// @ts-check

import fse from 'fs-extra'
import { fetchMods, loadMCInstanceFiltered } from './index.js'

const { readFileSync, readJsonSync, writeFileSync } = fse

export interface ModLoader {
  id: string
  primary: boolean
}

export interface Minecraft {
  version: string
  modLoaders?: ModLoader[]
}

export interface ExternalDependency {
  name: string
  url: string
  sha: string
}

export interface ModpackManifestFile {
  projectID: number
  fileID: number
  required: boolean
  sides?: ('client' | 'server')[]
}

export interface ModpackManifest {
  minecraft: Minecraft
  manifestType: string
  manifestVersion: number
  name: string
  version: string
  author: string
  projectID: number
  externalDependencies?: ExternalDependency[]
  files: ModpackManifestFile[]
  overrides: string
}

function formatModList(modsList: ModpackManifestFile[]) {
  return JSON.stringify(modsList)
    .replace(/(":)(\d+)/g, (m, r1, r2) => r1 + r2.padStart(6)) // Table aligning
    .replace(/\[{/, '[\n    {')
    .replace(/}]/, '}\n  ]')
    .replace(/},{/g, '},\n    {') // new lines
}

export async function generateManifest(
  mcinstancePath = 'minecraftinstance.json',
  options: {
    key: string
    ignore?: string
    packVersion?: string
    postfix?: string
    verbose?: boolean
  }
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
  const addonsListUnfiltered = loadMCInstanceFiltered(mcinstancePath, options.ignore).installedAddons
  if (options.verbose) process.stdout.write(`loaded, ${addonsListUnfiltered.length} addons\n`)

  if (options.verbose) process.stdout.write('Loading mods meta from CurseForge ... ')
  const cfModsList = await fetchMods(addonsListUnfiltered.map(a => a.addonID), options.key, undefined, options.verbose)
  if (options.verbose) process.stdout.write('loaded\n')

  const modListUnfiltered: ModpackManifestFile[] = addonsListUnfiltered.map((a, i) => ({
    projectID: a.addonID,
    fileID   : a.installedFile?.id,
    required : !a.installedFile?.fileNameOnDisk.endsWith('.jar.disabled'),
    ___name  : cfModsList[i].name,
  }))

  const resultObj: ModpackManifest = {
    minecraft: {
      version   : '1.12.2',
      modLoaders: [
        {
          id: `forge-${
            readFileSync('logs/debug.log', 'utf8').match(
              /Forge Mod Loader version ([^\s]+) for Minecraft 1.12.2 loading/
            )?.[1]
          }`,
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
    files          : [] as any[],
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
