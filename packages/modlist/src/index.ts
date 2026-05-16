/**
 * Create MODS.md
 *
 * @author Krutoy242
 * @see {@link https://github.com/Krutoy242}
 */

import type { ModsComparison } from '@mctools/curseforge'
import type { InstalledAddon, Minecraftinstance } from '@mctools/curseforge/minecraftinstance'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { fetchMods, modListDiff, modListUnion } from '@mctools/curseforge'
import Handlebars from 'handlebars'

interface AddonDifference {
  now: InstalledAddon
  was: InstalledAddon
}

function relative(relPath: string): string {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const QUERY_INDEX_REGEX = /\[(\d+)\]/g
const QUERY_DOT_REGEX = /^\./

/** Typed lodash.get-lite. Returns `defaultVal` when path cannot be resolved. */
function getPath(obj: unknown, query: string, defaultVal?: unknown): unknown {
  const parts = query.replace(QUERY_INDEX_REGEX, '.$1').replace(QUERY_DOT_REGEX, '').split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return defaultVal
    if (!(part in cur)) return defaultVal
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/**
 * Options for mod list generator
 */
export interface ModListOpts {
  /** Json object from `minecraftinstance.json` of current version */
  fresh: Minecraftinstance

  /** Json object from `minecraftinstance.json` of previous version. */
  old?: Minecraftinstance

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

  /** Output information about working process */
  verbose?: boolean

  /** Callback for verbose logging. If not provided, verbose does nothing. */
  onLog?: (msg: string) => void
}

const SANITIZE_NEWLINES_REGEX = /\n/g
const SANITIZE_MARKDOWN_REGEX = /([|`*_])/g

/**
 * Generate modlist for given `minecraftinstance.json` file
 * @param opts Options for mod list generator
 * @returns Markdown file based on given Handlebars template
 */
export async function generateModsList(opts: ModListOpts): Promise<string> {
  const log = (msg: string): void => {
    if (opts.verbose) opts.onLog?.(msg)
  }

  log('Get Mods diffs from JSONs ... ')
  const diff: ModsComparison = opts.old
    ? modListDiff(opts.fresh, opts.old, opts.ignore)
    : modListUnion(opts.fresh, opts.ignore)
  log(' done\n')

  const cursedMap = new Map<number, Awaited<ReturnType<typeof fetchMods>>[number]>()
  if (opts.key) {
    log('Asking Curseforge API for mods ... ')
    const cursedUnion = await fetchMods(diff.union.map(addon => addon.addonID), opts.key)
    cursedUnion.sort((a, b) => a.id - b.id)
    log('done\n')

    cursedUnion.forEach(o => cursedMap.set(o.id, o))
  }

  // Sorting function
  let sortKey = opts.sort ?? 'addonID'
  let sortDirection = 1
  if (sortKey.startsWith('/')) {
    sortDirection = -1
    sortKey = sortKey.substring(1)
  }
  const sortFn = (a: AddonDifference | InstalledAddon, b: AddonDifference | InstalledAddon): number => {
    const av = getPath(a, sortKey, 0) as number
    const bv = getPath(b, sortKey, 0) as number
    return av - bv
  }
  const sort = (a: AddonDifference | InstalledAddon, b: AddonDifference | InstalledAddon): number => sortDirection * sortFn(a, b)

  type EnrichedAddon = InstalledAddon & { cf2Addon?: Awaited<ReturnType<typeof fetchMods>>[number] }
  type EnrichedDiff = AddonDifference & { now: EnrichedAddon, was: EnrichedAddon }

  const enrichAddon = (o: InstalledAddon): EnrichedAddon => ({ ...o, cf2Addon: cursedMap.get(o.addonID) })
  const enrichDiff = (o: AddonDifference): EnrichedDiff => ({ now: enrichAddon(o.now), was: enrichAddon(o.was) })

  const enriched: ModsComparison & { updated?: EnrichedDiff[] } = {
    union  : diff.union.map(enrichAddon),
    both   : diff.both?.map(enrichAddon),
    added  : diff.added?.map(enrichAddon),
    removed: diff.removed?.map(enrichAddon),
    updated: diff.updated?.map(enrichDiff),
  }

  enriched.updated?.sort((a, b) => sort(a.now, b.now))
  for (const key of ['union', 'both', 'added', 'removed'] as const) {
    enriched[key]?.sort(sort)
  }

  Handlebars.registerHelper('sanitize', (str: string) => String(str).replace(SANITIZE_NEWLINES_REGEX, ' ').replace(SANITIZE_MARKDOWN_REGEX, '\\$1').trim())
  Handlebars.registerHelper('replace', (str: string, from: string, to: string) => String(str).replace(from, to))
  Handlebars.registerHelper('padEnd', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padEnd(pad))
  Handlebars.registerHelper('padStart', (str: string, pad: number, options: { hash: { pre?: string, post?: string } }) => ((options.hash.pre ?? '') + String(str) + (options.hash.post ?? '')).padStart(pad))

  const builder = Handlebars.compile(opts.template ?? readFileSync(relative('../default.hbs'), 'utf8'))

  return builder(enriched)
}
