import type { ReducerConfig } from '../config.js'
import type { Mod } from '../Mod.js'
import type { WarningEntry } from '../ModStore.js'
import { resolve } from 'pathe'
import { getConfig } from '../config.js'
import { ModStore } from '../ModStore.js'

export interface Runtime {
  mcPath  : string
  config  : ReducerConfig
  mods    : Mod[]
  warnings: WarningEntry[]
}

const runtimeCache = new Map<string, Runtime>()

/**
 * React-free load of the modpack: config + mod graph + warnings. Shared by
 * every non-interactive command so the dependency graph (and thus the
 * enable/disable closures) is always populated.
 *
 * Repeated calls with the same resolved mcPath return the cached Runtime.
 * Cache is module-scoped: across test files in the same process the fixture
 * is loaded once. Production use with different packs still works because
 * the key is the resolved path.
 */
export async function loadRuntime(mcPath: string): Promise<Runtime> {
  const key = resolve(mcPath)
  const cached = runtimeCache.get(key)
  if (cached) return cached

  const config = await getConfig(mcPath)
  const store = await ModStore.load(mcPath, config)
  const runtime: Runtime = { mcPath, config, mods: store.mods, warnings: store.warnings }
  runtimeCache.set(key, runtime)
  return runtime
}
