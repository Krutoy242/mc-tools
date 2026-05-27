/**
 * Create MODS.md
 *
 * @author Krutoy242
 * @see {@link https://github.com/Krutoy242}
 */

import type { ModsComparison } from '@mctools/curseforge'
import type { InstalledAddon } from '@mctools/curseforge/minecraftinstance'
import type { AddonDifference, EnrichedAddon, EnrichedDiff, ModListOpts } from './types.js'

import { fetchChangelogs, fetchMods, modListDiff, modListUnion } from '@mctools/curseforge'
import { buildModChangelog } from './changelog/processor.js'
import { createSortFn } from './sort.js'
import { compileTemplate, registerHelpers } from './template.js'
import { formatDuration, runConcurrent } from './utils/misc.js'

export type { ModListOpts } from './types.js'

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
  const tDiff = performance.now()
  const diff: ModsComparison = opts.old
    ? modListDiff(opts.fresh, opts.old, opts.ignore)
    : modListUnion(opts.fresh, opts.ignore)
  log(` done (${formatDuration(performance.now() - tDiff)})\n`)

  const cursedMap = new Map<number, Awaited<ReturnType<typeof fetchMods>>[number]>()
  if (opts.key) {
    log('Asking Curseforge API for mods ... ')
    const tMods = performance.now()
    const cursedUnion = await fetchMods(diff.union.map(addon => addon.addonID), opts.key)
    cursedUnion.sort((a, b) => a.id - b.id)
    log(`done (${formatDuration(performance.now() - tMods)})\n`)
    cursedUnion.forEach(o => cursedMap.set(o.id, o))
  }

  const modChangelogs = new Map<number, string>()
  if (opts.key && opts.old && opts.changelog !== false && diff.updated?.length) {
    log('Asking Curseforge API for changelogs ...\n')

    // Batch-fetch old file changelogs to avoid N individual requests
    const oldEntries = diff.updated.map(u => ({
      modId : u.now.addonID,
      fileId: u.was.installedFile.id,
    }))
    const tOld = performance.now()
    const oldChangelogsMap = await fetchChangelogs(oldEntries, opts.key)
    log(`  Old changelogs fetched (${formatDuration(performance.now() - tOld)})\n`)

    // Process each updated mod concurrently with a limit
    const tBuild = performance.now()
    const UPDATED_CONCURRENCY = 15
    await runConcurrent(
      diff.updated,
      async (update, idx) => {
        const tMod = performance.now()
        const oldHtml = oldChangelogsMap.get(update.was.installedFile.id)
        const changelog = await buildModChangelog(update, opts.key, opts.fresh.gameVersion, opts.verbose, oldHtml)
        modChangelogs.set(update.now.addonID, changelog)
        log(`  [${idx + 1}/${diff.updated!.length}] Mod ${update.now.addonID} changelog built (${formatDuration(performance.now() - tMod)})\n`)
      },
      UPDATED_CONCURRENCY
    )
    log(`  Total changelog build time: ${formatDuration(performance.now() - tBuild)}\n`)
    log('done\n')
  }

  const sort = createSortFn(opts.sort ?? 'addonID')

  const enrichAddon = (o: InstalledAddon, changelog?: string): EnrichedAddon =>
    ({ ...o, cf2Addon: cursedMap.get(o.addonID), changelog })

  const enrichDiff = (o: AddonDifference): EnrichedDiff => ({
    now: enrichAddon(o.now, modChangelogs.get(o.now.addonID)),
    was: enrichAddon(o.was),
  })

  const enriched: ModsComparison & { updated?: EnrichedDiff[] } = {
    union  : diff.union.map(a => enrichAddon(a)),
    both   : diff.both?.map(a => enrichAddon(a)),
    added  : diff.added?.map(a => enrichAddon(a)),
    removed: diff.removed?.map(a => enrichAddon(a)),
    updated: diff.updated?.map(enrichDiff),
  }

  enriched.updated?.sort((a, b) => sort(a.now, b.now))
  for (const key of ['union', 'both', 'added', 'removed'] as const) {
    enriched[key]?.sort(sort)
  }

  registerHelpers()
  const builder = compileTemplate(opts.template)

  return builder(enriched)
}
