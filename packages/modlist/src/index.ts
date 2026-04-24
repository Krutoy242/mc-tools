/**
 * Create MODS.md
 *
 * @author Krutoy242
 * @see {@link https://github.com/Krutoy242}
 */

import type { AddonDifference, ModsComparsion } from '@mctools/curseforge'
import type { InstalledAddon, Minecraftinstance } from '@mctools/curseforge/minecraftinstance'

import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { fetchMods, modListDiff, modListUnion } from '@mctools/curseforge'
import fse from 'fs-extra'
import Handlebars from 'handlebars'

const { readFileSync } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const QUERY_INDEX_REGEX = /\[(\d+)\]/g
const QUERY_DOT_REGEX = /^\./

// Simple implementation of lodash.get
// Handles arrays, objects, and any nested combination of the two.
// Also handles undefined as a valid value - see test case for details.
// Based on: https://gist.github.com/harish2704/d0ee530e6ee75bad6fd30c98e5ad9dab
function deepGet(obj: unknown, query: (number | string)[] | string, defaultVal?: unknown): unknown {
  const queryArray = Array.isArray(query)
    ? query
    : query.replace(QUERY_INDEX_REGEX, '.$1').replace(QUERY_DOT_REGEX, '').split('.')

  const key = queryArray[0]
  if (key === undefined || typeof obj !== 'object' || obj === null || !(key in obj)) return defaultVal

  const nextObj = (obj as Record<string, unknown>)[key]
  if (nextObj && queryArray.length > 1)
    return deepGet(nextObj, queryArray.slice(1), defaultVal)

  return nextObj
}

/**
 * Options for mod list generator
 */
export interface ModListOpts {
  /**
   * .gitignore-like file content with mods to ignore.
   * @see modListDiff
   */
  ignore?: string

  /** CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys */
  key: string

  /**
   * Sort field of CurseForge addon.
   * Accept deep path like `cf2Addon.downloadCount`.
   * `/` symbol at start of value flip sort order.
   */
  sort?: string

  /** Custom Handlebars template to generate result */
  template?: string

  /** Output information about working process in stdout */
  verbose?: boolean
}

const SANITIZE_NEWLINES_REGEX = /\n/g
const SANITIZE_MARKDOWN_REGEX = /([|`*_])/g

/**
 * Generate modlist for given `minecraftinstance.json` file
 * @param mcInstanceFresh Json object from `minecraftinstance.json` of current version
 * @param mcInstanceOld Json object from `minecraftinstance.json` of previous version.
 * @param opts Options for mod list generator
 * @returns Markdown file based on given Handlebars template
 */
export async function generateModsList(
  mcInstanceFresh: Minecraftinstance,
  mcInstanceOld?: Minecraftinstance,
  opts?: ModListOpts
) {
  if (opts?.verbose) process.stdout.write('Get Mods diffs from JSONs ... ')
  const diff: ModsComparsion = mcInstanceOld
    ? modListDiff(mcInstanceFresh, mcInstanceOld, opts?.ignore)
    : modListUnion(mcInstanceFresh, opts?.ignore)
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
  const sortFn = (a: AddonDifference | InstalledAddon, b: AddonDifference | InstalledAddon) => (deepGet(a, sortKey) as number) - (deepGet(b, sortKey) as number)
  const sort = (a: AddonDifference | InstalledAddon, b: AddonDifference | InstalledAddon) => sortDirection ? sortFn(a, b) : sortFn(b, a)

  if (diff.updated) {
    diff.updated.forEach((o) => {
      o.now.cf2Addon = cursedMap[o.now.addonID]
      o.was.cf2Addon = cursedMap[o.was.addonID]
    })
    diff.updated.sort((a, b) => sort(a.now, b.now))
  }

  for (const key of ['union', 'added', 'removed'] as const) {
    diff[key]?.forEach((o) => {
      o.cf2Addon = cursedMap[o.addonID]
    })
    diff[key]?.sort(sort)
  }

  Handlebars.registerHelper('sanitize', (str: string) => String(str).replace(SANITIZE_NEWLINES_REGEX, ' ').replace(SANITIZE_MARKDOWN_REGEX, '\\$1').trim())
  Handlebars.registerHelper('replace', (str: string, from: string, to: string) => String(str).replace(from, to))
  Handlebars.registerHelper('padEnd', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padEnd(pad))
  Handlebars.registerHelper('padStart', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padStart(pad))

  const builder = Handlebars.compile(opts?.template ?? readFileSync(relative('../default.hbs'), 'utf8'))

  return builder(diff)
}
