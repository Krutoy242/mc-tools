import type { StatusMap } from '../binarySearch.js'
import type { Launcher } from '../launcher/types.js'
import type { Mod } from '../Mod.js'
import type { ConditionContext, Conditions } from './conditions.js'
import {
  classifyAfterAnswer,
  countByStatus,
  getStatus,
  nextPartition,
} from '../binarySearch.js'
import { restartAndMonitor } from '../launcher/monitor.js'
import { Mod as ModClass } from '../Mod.js'
import { buildFullLogContext } from './validate.js'

/** Overall ceiling: stop bisecting after this long no matter what. */
const TOTAL_DEADLINE_MS = 10 * 60_000
/** Per-test monitor ceiling and the stall window that flags an unresponsive game. */
const PER_TEST_MS = 5 * 60_000
const UNRESPONSIVE_MS = 3 * 60_000

export interface IterationRecord {
  enabled     : number
  disabled    : number
  bugPersists?: boolean
}

export type AutoOutcome = 'culprit' | 'no-suspects' | 'inconclusive' | 'aborted'

export interface AutoResult {
  outcome   : AutoOutcome
  culprit?  : Mod
  iterations: IterationRecord[]
  message?  : string
}

export interface AutoOptions {
  mcDir      : string
  mods       : Mod[]
  conditions : Conditions
  launcher   : Launcher
  dry        : boolean
  trusted?   : Mod[]
  ignored?   : Mod[]
  log        : (line: string) => void
  /** Persist progress after each iteration so a kill can be resumed. */
  onProgress?: (status: StatusMap, iterations: IterationRecord[]) => void
}

function toCtx(tick: { debugLog: string[], craftTweakerLog: string[], elapsed: number, crashed: boolean }): ConditionContext {
  return {
    debugLog       : tick.debugLog,
    craftTweakerLog: tick.craftTweakerLog,
    debugText      : tick.debugLog.join('\n'),
    elapsed        : tick.elapsed,
    crashed        : tick.crashed,
  }
}

/**
 * Run the automated binary search. Each iteration partitions the remaining
 * suspects, applies the split, restarts Minecraft (real mode) and watches the
 * logs until `isTestEnded`, then reads the verdict from `isBugFound`. In `dry`
 * mode nothing is launched: the verdict is taken once from the current full log
 * and the bisection is simulated to surface a single culprit.
 *
 * On a file-lock failure it stops with `aborted` and leaves the session intact
 * so the user can free the file and resume with `--continue`.
 */
export async function runAutoBinary(opts: AutoOptions): Promise<AutoResult> {
  const { mcDir, mods, conditions, launcher, dry, log } = opts
  const status: StatusMap = new Map()
  for (const m of opts.trusted ?? []) status.set(m, 'trusted')
  for (const m of opts.ignored ?? []) status.set(m, 'ignored')

  log(`trusted (kept disabled): ${(opts.trusted ?? []).map(m => m.displayName).join(', ') || '<none>'}`)
  log(`ignored (kept enabled):  ${(opts.ignored ?? []).map(m => m.displayName).join(', ') || '<none>'}`)

  // Apply the seed classification once (real mode only).
  if (!dry) {
    const f1 = await ModClass.disable(opts.trusted ?? [])
    const f2 = await ModClass.enable(opts.ignored ?? [])
    const failed = [...f1.failed, ...f2.failed]
    if (failed.length) {
      return { outcome: 'aborted', iterations: [], message: lockMessage(failed) }
    }
  }

  // Dry verdict is constant: evaluate the bug against the current full log once.
  let dryVerdict = false
  if (dry) {
    const ctx = await buildFullLogContext(mcDir)
    dryVerdict = conditions.isBugFound(ctx)
    log(`dry verdict from current log: bug ${dryVerdict ? 'present' : 'absent'}`)
  }

  const iterations: IterationRecord[] = []
  const deadline = Date.now() + TOTAL_DEADLINE_MS

  for (;;) {
    if (!dry && Date.now() > deadline) {
      return { outcome: 'inconclusive', iterations, message: `exceeded the ${TOTAL_DEADLINE_MS / 60_000}-minute ceiling` }
    }

    const plan = nextPartition(mods, status)
    const remaining = mods.filter(m => getStatus(status, m) === 'suspect')

    if (remaining.length === 1) {
      return { outcome: 'culprit', culprit: remaining[0], iterations }
    }
    if (remaining.length === 0) {
      return { outcome: 'no-suspects', iterations, message: 'no suspects left to bisect' }
    }
    if (plan.disabledSuspects.size === 0 || plan.enabledSuspects.size === 0) {
      return { outcome: 'inconclusive', iterations, message: 'cannot split the remaining suspects further' }
    }

    // ----- apply -----
    if (dry) {
      log(`iter #${iterations.length + 1}: assumed enable ${plan.enabledSuspects.size} / assumed disable ${plan.disabledSuspects.size}`)
    }
    else {
      const dis = await ModClass.disable([...plan.disable])
      const en = await ModClass.enable([...plan.enable])
      const failed = [...dis.failed, ...en.failed]
      if (failed.length) {
        return { outcome: 'aborted', iterations, message: lockMessage(failed) }
      }
      log(`iter #${iterations.length + 1}: enabled ${en.ok} / disabled ${dis.ok}`)
    }

    // ----- verdict -----
    let verdict: boolean
    if (dry) {
      verdict = dryVerdict
    }
    else {
      let captured: boolean | undefined
      const res = await restartAndMonitor(mcDir, launcher, {
        maxMs  : PER_TEST_MS,
        stallMs: UNRESPONSIVE_MS,
        log,
        onTick : (tick) => {
          const ctx = toCtx(tick)
          if (conditions.isTestEnded(ctx)) {
            captured = conditions.isBugFound(ctx)
            return 'stop'
          }
        },
      })
      if (captured === undefined) {
        // Sanity fallback: test never self-reported an end. Read the verdict from
        // whatever the full log holds and note why we bailed.
        const ctx = await buildFullLogContext(mcDir)
        verdict = conditions.isBugFound(ctx)
        log(`  test did not self-end (${res.outcome}); verdict from full log: bug ${verdict ? 'present' : 'absent'}`)
        if (res.outcome === 'crash' && res.crashSummary) log(`  crash: ${res.crashSummary.split('\n')[0]}`)
      }
      else {
        verdict = captured
      }
    }

    // ----- classify -----
    const before = status
    const next = classifyAfterAnswer(before, plan, verdict)
    for (const [m, s] of next) status.set(m, s)
    iterations.push({
      enabled    : plan.enabledSuspects.size,
      disabled   : plan.disabledSuspects.size,
      bugPersists: verdict,
    })
    opts.onProgress?.(status, iterations)

    const counts = countByStatus(mods, status)
    log(`  → suspects ${counts.suspect} · trusted ${counts.trusted} · ignored ${counts.ignored}`)

    if (counts.suspect === 1) {
      return { outcome: 'culprit', culprit: mods.find(m => getStatus(status, m) === 'suspect'), iterations }
    }
  }
}

function lockMessage(failed: { mod: Mod, error: string }[]): string {
  const names = failed.slice(0, 5).map(f => `${f.mod.fileNameNoExt} (${f.error})`).join('; ')
  return `could not toggle ${failed.length} mod file(s): ${names}. Free the file(s) (close the game / unlock the jar) and resume with --continue.`
}
