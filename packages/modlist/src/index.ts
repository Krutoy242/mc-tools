/**
 * @file Create MODS.md
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { fileURLToPath } from 'node:url'

import fse from 'fs-extra'

import Handlebars from 'handlebars'
import type { ModsComparsion } from 'mct-curseforge'
import { fetchMods, modList } from 'mct-curseforge'
import type { InstalledAddon, Minecraftinstance } from 'mct-curseforge/minecraftinstance'

const { readFileSync } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

// Simple implementation of lodash.get
// Handles arrays, objects, and any nested combination of the two.
// Also handles undefined as a valid value - see test case for details.
// Based on: https://gist.github.com/harish2704/d0ee530e6ee75bad6fd30c98e5ad9dab
function deepGet(obj: { [x: string]: any }, query: string | (string | number)[], defaultVal?: any) {
  query = Array.isArray(query)
    ? query
    : query.replace(/(\[(\d)\])/g, '.$2').replace(/^\./, '').split('.')

  if (!(query[0] in obj)) return defaultVal

  obj = obj[query[0]]
  if (obj && query.length > 1)
    return deepGet(obj, query.slice(1), defaultVal)

  return obj
}

export interface ModListOpts {
  key: string
  ignore?: string
  template?: string
  verbose?: boolean
  sort?: string
}

export async function generateModsList(
  mcInstancePath: string,
  mcInstancePathOld?: string,
  opts?: ModListOpts
) {
  if (opts?.verbose) process.stdout.write('Get Mods diffs from JSONs ... ')
  const diff = modList(mcInstancePath, mcInstancePathOld, opts?.ignore)
  if (opts?.verbose) process.stdout.write(' done\n')

  const cursedMap: Record<number, Awaited<ReturnType<typeof fetchMods>>[number]> = {}
  if (opts?.key) {
    if (opts?.verbose) process.stdout.write('Asking Curseforge API for mods ... ')
    const cursedUnion = await fetchMods(diff.union.map(addon => addon.addonID), opts.key)
    cursedUnion.sort((a, b) => a.id - b.id)
    if (opts?.verbose) process.stdout.write('done\n')

    cursedUnion.forEach(o => cursedMap[o.id] = o)
  }

  // Sorting function
  let sortKey = opts?.sort ?? 'addonID'
  let sortDirection = true
  if (sortKey.startsWith('/')) {
    sortDirection = false
    sortKey = sortKey.substring(1)
  }
  const sortFn = (a: InstalledAddon, b: InstalledAddon) => deepGet(a, sortKey) - deepGet(b, sortKey)
  const sort = (a: InstalledAddon, b: InstalledAddon) => sortDirection ? sortFn(a, b) : sortFn(b, a)

  for (const key of (Object.keys(diff) as (keyof ModsList)[])) {
    diff[key]?.forEach((o: any) => {
      if (key === 'updated') {
        o.now.cf2Addon = cursedMap[o.now.addonID]
        o.was.cf2Addon = cursedMap[o.was.addonID]
      }
      else { o.cf2Addon = cursedMap[o.addonID] }
    })
    if (key === 'updated')
      diff[key]?.sort((a, b) => sort(a.now, b.now))
    else diff[key]?.sort(sort)
  }

  Handlebars.registerHelper('replace', (str, from, to) => String(str).replace(from, to))
  Handlebars.registerHelper('padEnd', (str, pad, options) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padEnd(pad))
  Handlebars.registerHelper('padStart', (str, pad, options) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padStart(pad))

  const builder = Handlebars.compile(opts?.template ?? readFileSync(relative('default.hbs'), 'utf8'))

  return builder(diff)
}
