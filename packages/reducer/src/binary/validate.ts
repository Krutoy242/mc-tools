import type { ConditionContext, Conditions } from './conditions.js'
import { readFile } from 'node:fs/promises'
import { ctLogPath, dbgLogPath } from '../launcher/monitor.js'

/** Per-call budget for a condition function before it's deemed unproductive. */
const PERF_BUDGET_MS = 2000
const PERF_SAMPLES = 10

export interface PerfOptions {
  /** Per-call budget in ms (default 2000). */
  budgetMs?: number
  /** Sample count after the discarded warm-up call (default 10). */
  samples? : number
}

export interface ValidationResult {
  ok      : boolean
  /** Fatal problems — block the run unless `--force`. */
  errors  : string[]
  /** Non-fatal observations (e.g. bug not currently visible). */
  warnings: string[]
}

/** Build a context from the whole current logs ("here is a finished run"). */
export async function buildFullLogContext(mcDir: string): Promise<ConditionContext> {
  const debugText = await readFile(dbgLogPath(mcDir), 'utf8').catch(() => '')
  const ctText = await readFile(ctLogPath(mcDir), 'utf8').catch(() => '')
  const debugLog = debugText ? debugText.split('\n') : []
  const craftTweakerLog = ctText ? ctText.split('\n') : []
  return { debugLog, craftTweakerLog, debugText, elapsed: Number.MAX_SAFE_INTEGER, crashed: false }
}

/**
 * Reachability check: replay the *complete* current debug.log through the config
 * (the "I found the bug, here is how it looks" scenario). If `isTestEnded` never
 * matches, the loop could never conclude from logs alone, so we flag it (the
 * caller offers `--force`). A non-matching `isBugFound` is only a warning — the
 * bug may simply be absent from the present log.
 */
export function checkReachability(conditions: Conditions, ctx: ConditionContext): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let ended = false
  let bug = false
  try {
    ended = conditions.isTestEnded(ctx)
  }
  catch (e) {
    errors.push(`isTestEnded threw on the current log: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    bug = conditions.isBugFound(ctx)
  }
  catch (e) {
    errors.push(`isBugFound threw on the current log: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!ended) {
    errors.push(
      bug
        ? 'isTestEnded never matched the current full debug.log — the bisect loop could never end from logs (it would rely only on timeouts).'
        : 'neither isTestEnded nor isBugFound matched the current full debug.log — the config is likely unreachable / wrong.'
    )
  }
  else if (!bug) {
    warnings.push('isBugFound did not match the current log — expected if the bug is not currently present.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Performance check: time {@link PERF_SAMPLES}+1 calls of each function on a
 * realistic (full-log) context, discard the first (cache warm-up), and flag any
 * average over {@link PERF_BUDGET_MS} — the catastrophic-backtracking guard.
 */
export function checkPerformance(conditions: Conditions, ctx: ConditionContext, opts: PerfOptions = {}): ValidationResult {
  const budgetMs = opts.budgetMs ?? PERF_BUDGET_MS
  const samples = opts.samples ?? PERF_SAMPLES
  const errors: string[] = []
  for (const [label, fn] of [['isTestEnded', conditions.isTestEnded], ['isBugFound', conditions.isBugFound]] as const) {
    let total = 0
    try {
      fn(ctx) // discarded warm-up
      for (let i = 0; i < samples; i++) {
        const start = performance.now()
        fn(ctx)
        total += performance.now() - start
      }
    }
    catch (e) {
      errors.push(`${label} threw during the performance probe: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const avg = total / samples
    if (avg > budgetMs) {
      errors.push(`${label} averages ${avg.toFixed(0)}ms/call (budget ${budgetMs}ms) — likely super-linear backtracking.`)
    }
  }
  return { ok: errors.length === 0, errors, warnings: [] }
}

/** Run reachability + performance and merge the results. */
export async function validateConditions(conditions: Conditions, mcDir: string): Promise<ValidationResult> {
  const ctx = await buildFullLogContext(mcDir)
  const reach = checkReachability(conditions, ctx)
  const perf = checkPerformance(conditions, ctx)
  return {
    ok      : reach.ok && perf.ok,
    errors  : [...reach.errors, ...perf.errors],
    warnings: [...reach.warnings, ...perf.warnings],
  }
}
