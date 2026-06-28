import type { ReducerConfig } from '../config.js'
import type { Mod } from '../Mod.js'
import type { WarningEntry } from '../ModStore.js'
import { getConfig } from '../config.js'
import { ModStore } from '../ModStore.js'

export interface Runtime {
  mcPath  : string
  config  : ReducerConfig
  mods    : Mod[]
  warnings: WarningEntry[]
}

/**
 * React-free load of the modpack: config + mod graph + warnings. Shared by
 * every non-interactive command so the dependency graph (and thus the
 * enable/disable closures) is always populated.
 */
export async function loadRuntime(mcPath: string): Promise<Runtime> {
  const config = await getConfig(mcPath)
  const store = await ModStore.load(mcPath, config)
  return { mcPath, config, mods: store.mods, warnings: store.warnings }
}
