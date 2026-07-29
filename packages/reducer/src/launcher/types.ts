/**
 * Abstraction over "how do we start/stop Minecraft for this instance".
 * The bundled default is {@link PrismLauncher} (Windows + PrismLauncher), but a
 * modpack can override it via `reducer.config` so the published package is not
 * hard-wired to one launcher.
 */
export interface Launcher {
  /** Short name for diagnostics, e.g. `prismlauncher`. */
  readonly name: string
  /** One-line "what is being booted", e.g. `E2EE · MC 1.12.2 · Forge 14.23.5.2860`. */
  describe?    : () => Promise<string>
  /** PID of the running game process for this instance, or `null` if stopped. */
  getPid       : () => Promise<number | null>
  /** Launch the game detached; resolves once the launch was issued. */
  launch       : () => Promise<void>
  /** Kill the game (graceful close, then force) and any sidecar watchdogs. */
  kill         : (pid: number) => Promise<void>
}

/**
 * `describe()` if the launcher offers one, else its bare name — so a log line
 * always says *which* instance/loader booted, never crashing on a launcher that
 * can't tell (a `command` one, say).
 */
export async function describeLauncher(launcher: Launcher): Promise<string> {
  try {
    return await launcher.describe?.() ?? launcher.name
  }
  catch {
    return launcher.name
  }
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
  /** For an `idle` outcome: which readiness layer fired (pack line / port / menu). */
  reached?     : 'pattern' | 'port' | 'menu'
  pid?         : number
  crashSummary?: string
}
