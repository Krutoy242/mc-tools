/** Sink for diagnostic messages. `newline` defaults to `true`. */
export type Logger = (msg: string, newline?: boolean) => void

/**
 * Shared context threaded through every resolution step. Built once by
 * {@link findModSource} from its options (with env-var fallbacks).
 */
export interface Ctx {
  /** Directory holding cloned / decompiled mod sources. */
  modSources: string
  /** Minecraft instance directory (contains `mods/`, `minecraftinstance.json`). */
  mcDir     : string
  /** CurseForge API key, used to look up `sourceUrl`/`issuesUrl`. */
  cfApiKey? : string
  /** Diagnostic logger (writes to stderr by default). */
  log       : Logger
}

/** Narrow view of an addon entry in `minecraftinstance.json`. */
export interface InstanceAddon {
  addonID       : number
  name          : string
  fileNameOnDisk: string
  issuesURL?    : string
  primaryAuthor?: string
  authors?      : { name?: string }[]
}

export interface MinecraftInstance {
  installedAddons: InstanceAddon[]
}
