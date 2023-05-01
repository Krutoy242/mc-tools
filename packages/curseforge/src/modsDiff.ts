/**
 * @file Create MODS.md
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { fileURLToPath } from 'node:url'

import fse from 'fs-extra'
import type { CF2Addon } from 'curseforge-v2'

import Handlebars from 'handlebars'
import type { ModsList } from './index.js'
import { fetchMods, modList } from './index.js'

const { readFileSync } = fse

function relative(relPath) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

export async function generateModsList(
  mcInstancePath: string,
  mcInstancePathOld?: string,
  opts?: {
    key: string
    ignore?: string
    template?: string
    verbose?: boolean
  }
) {
  if (opts?.verbose) process.stdout.write('Get Mods diffs from JSONs ... ')
  const diff = modList(mcInstancePath, mcInstancePathOld, opts?.ignore)
  if (opts?.verbose) process.stdout.write(' done\n')

  const cursedMap: Record<number, CF2Addon> = {}
  if (opts?.key) {
    if (opts?.verbose) process.stdout.write('Asking Curseforge API for mods ... ')
    const cursedUnion = await fetchMods(diff.union.map(addon => addon.addonID), opts.key)
    cursedUnion.sort((a, b) => a.id - b.id)
    if (opts?.verbose) process.stdout.write('done\n')

    cursedUnion.forEach(o => cursedMap[o.id] = o)
  }

  for (const key of (Object.keys(diff) as (keyof ModsList)[])) {
    diff[key]?.forEach((o: any) => {
      if (key === 'updated') {
        o.now.cf2Addon = cursedMap[o.now.addonID]
        o.was.cf2Addon = cursedMap[o.was.addonID]
      }
      else { o.cf2Addon = cursedMap[o.addonID] }
    })
    if (key === 'updated')
      diff[key]?.sort((a, b) => a.now.addonID - b.now.addonID)
    else diff[key]?.sort((a, b) => a.addonID - b.addonID)
  }

  Handlebars.registerHelper('replace', (str, from, to) => String(str).replace(from, to))
  Handlebars.registerHelper('padEnd', (str, pad, options) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padEnd(pad))
  Handlebars.registerHelper('padStart', (str, pad, options) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padStart(pad))

  const builder = Handlebars.compile(opts?.template ?? readFileSync(relative('default.hbs'), 'utf8'))

  return builder(diff)
}
