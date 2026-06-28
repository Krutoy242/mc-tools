import type { LauncherConfig } from '../config.js'
import type { Launcher } from './types.js'
import process from 'node:process'
import { CommandLauncher } from './command.js'
import { PrismLauncher } from './prism.js'

export type { MonitorOptions, MonitorTick } from './monitor.js'
export { readCraftTweakerErrors, restartAndMonitor } from './monitor.js'
export type { Launcher, MonitorOutcome, MonitorResult } from './types.js'

/**
 * Build the {@link Launcher} for this modpack. `REDUCER_LAUNCHER=command|prism`
 * overrides the config; otherwise `config.launcher.kind` decides (default
 * `prism`). `command` is the portable, fully config-driven option.
 */
export function resolveLauncher(mcPath: string, config: LauncherConfig): Launcher {
  const kind = (process.env.REDUCER_LAUNCHER as LauncherConfig['kind'] | undefined) ?? config.kind
  if (kind === 'command') return new CommandLauncher(mcPath, config)
  return new PrismLauncher(mcPath)
}
