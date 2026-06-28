/**
 * Abstraction over "how do we start/stop Minecraft for this instance".
 * The bundled default is {@link PrismLauncher} (Windows + PrismLauncher), but a
 * modpack can override it via `reducer.config` so the published package is not
 * hard-wired to one launcher.
 */
export interface Launcher {
  /** Short name for diagnostics, e.g. `prismlauncher`. */
  readonly name: string
  /** PID of the running game process for this instance, or `null` if stopped. */
  getPid       : () => Promise<number | null>
  /** Launch the game detached; resolves once the launch was issued. */
  launch       : () => Promise<void>
  /** Kill the game (graceful close, then force) and any sidecar watchdogs. */
  kill         : (pid: number) => Promise<void>
}

/** Outcome of a monitored launch. */
export type MonitorOutcome
  = | 'idle' // log went quiet → game finished loading
    | 'crash' // a crash report appeared
    | 'exit' // game process died without a crash report
    | 'timeout' // overall ceiling reached
    | 'stopped' // an onTick callback asked to stop

export interface MonitorResult {
  outcome      : MonitorOutcome
  pid?         : number
  crashSummary?: string
}
