import type { Mod } from '../Mod.js'
import type { Drift, SessionState } from '../session/lock.js'
import { clearSession, detectDrift, hasDrift, readSession } from '../session/lock.js'

export interface SessionFlags {
  continue?: boolean
  new?     : boolean
}

export type SessionGuard
  = | { mode: 'fresh' }
    | { mode: 'resume',      prev: SessionState }
    | { mode: 'interrupted', prev: SessionState }
    | { mode: 'drift',       prev: SessionState, drift: Drift }

/**
 * Decide how to treat a prior on-disk session at startup:
 *  - `--new` wipes it → fresh.
 *  - no session, or a cleanly-closed one (`phase: idle`) → fresh.
 *  - an interrupted session with `--continue` → resume, unless the modpack
 *    drifted (a jar was renamed/removed externally) → `drift`.
 *  - an interrupted session without a flag → `interrupted` (caller must tell the
 *    user to pick `--continue` or `--new`).
 */
export function guardSession(mcPath: string, mods: Mod[], flags: SessionFlags): SessionGuard {
  if (flags.new) {
    clearSession(mcPath)
    return { mode: 'fresh' }
  }
  const prev = readSession(mcPath)
  if (!prev || prev.phase === 'idle') return { mode: 'fresh' }

  if (flags.continue) {
    const drift = detectDrift(prev.snapshot, mods)
    if (hasDrift(drift)) return { mode: 'drift', prev, drift }
    return { mode: 'resume', prev }
  }
  return { mode: 'interrupted', prev }
}
