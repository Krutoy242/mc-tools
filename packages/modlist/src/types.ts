import type { fetchMods } from '@mctools/curseforge'
import type { InstalledAddon, Minecraftinstance  } from '@mctools/curseforge/minecraftinstance'

export interface AddonDifference {
  now: InstalledAddon
  was: InstalledAddon
}

export interface ModListOpts {
  /** Json object from `minecraftinstance.json` of current version */
  fresh: Minecraftinstance

  /** Json object from `minecraftinstance.json` of previous version. */
  old?: Minecraftinstance

  /**
   * .gitignore-like file content with mods to ignore.
   */
  ignore?: string

  /** CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys */
  key: string

  /** Fetch changelogs for updated mods (only when `old` is provided). Defaults to `true`. */
  changelog?: boolean

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

export type Cf2Addon = Awaited<ReturnType<typeof fetchMods>>[number]

export type EnrichedAddon = InstalledAddon & {
  cf2Addon? : Cf2Addon
  changelog?: string
}

export type EnrichedDiff = AddonDifference & {
  now: EnrichedAddon
  was: EnrichedAddon
}
