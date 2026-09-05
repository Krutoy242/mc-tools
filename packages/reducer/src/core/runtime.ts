import type { ReducerConfig } from '../config.js'
import type { Mod } from '../Mod.js'
import type { WarningEntry } from '../ModStore.js'
import { join, resolve } from 'pathe'
import { getConfig } from '../config.js'
import { Mod as ModClass } from '../Mod.js'
import { ModStore } from '../ModStore.js'

export interface Runtime {
  /** Game dir: the jars this roster toggles, and the logs a launch writes. */
  mcPath  : string
  /** Pack dir: `reducer.config.yml` and `minecraftinstance.json` live here. */
  packPath: string
  config  : ReducerConfig
  mods    : Mod[]
  warnings: WarningEntry[]
}

export interface RuntimeOptions {
  /** Where the config and the instance manifest are, if not `mcPath` itself. */
  packPath?: string
  /** Config already loaded by the caller, so it is not read twice. */
  config?  : ReducerConfig
}

const runtimeCache = new Map<string, Runtime>()

/**
 * React-free load of the modpack: config + mod graph + warnings. Shared by
 * every non-interactive command so the dependency graph (and thus the
 * enable/disable closures) is always populated.
 *
 * `mcPath` and `packPath` differ for a game dir built out of the pack — a
 * dedicated server keeps its own `mods/` so its set can be reduced while the
 * client runs the full one, but it is described by the pack's manifest and
 * governed by the pack's config.
 *
 * Repeated calls with the same pair return the cached Runtime. Cache is
 * module-scoped: across test files in the same process the fixture is loaded
 * once. Production use with different packs still works because the key is the
 * resolved path pair.
 */
export async function loadRuntime(mcPath: string, opts: RuntimeOptions = {}): Promise<Runtime> {
  const packPath = opts.packPath ?? mcPath
  const key = `${resolve(mcPath)}|${resolve(packPath)}`
  const cached = runtimeCache.get(key)
  if (cached) {
    // The mods dir is global state on Mod; a cached hit must still claim it, or
    // a toggle lands in whichever roster was loaded last.
    ModClass.modsPath = join(cached.mcPath, 'mods')
    return cached
  }

  const config = opts.config ?? await getConfig(packPath)
  const store = await ModStore.load(packPath, config, undefined, join(mcPath, 'mods'))
  const runtime: Runtime = { mcPath, packPath, config, mods: store.mods, warnings: store.warnings }
  runtimeCache.set(key, runtime)
  return runtime
}
