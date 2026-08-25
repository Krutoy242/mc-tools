import type { Capability } from '../config.js'
import type { Mod } from '../Mod.js'
import type { ActionKind, ActionPlan } from './modActions.js'
import process from 'node:process'
import consola from 'consola'
import { runAutoBinary } from '../binary/auto.js'
import { loadConditions } from '../binary/conditions.js'
import { validateConditions } from '../binary/validate.js'
import { describeLauncher, probeReadyNow, resolveLauncher, restartAndMonitor, scanLogErrors, stallHint, waitUntilReady } from '../launcher/index.js'
import {
  clearSession,
  readSession,
  snapshotMods,
  writeSession,
} from '../session/lock.js'
import { formatFind } from './find.js'
import { applyPlan, computeAction, computeCombined, isConflict } from './modActions.js'
import { resolveMod, resolveMods } from './resolve.js'
import { loadRuntime } from './runtime.js'
import { guardSession } from './session.js'
import { summarizeDiagnostics, summarizeRoster, summarizeWeight } from './summaries.js'

/** Primary, parseable output → stdout. Diagnostics go through consola (stderr). */
function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function fmtSec(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

/** A boot that writes nothing for this long stops reading as progress. */
const STALL_WARN_MS = 45_000

function trimLine(s: string, max = 100): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Readiness config → monitor signals (all mod-agnostic, layers optional). */
function readySignals(cfg: { ready: { logPattern?: string, tcpPort?: number, quietMs: number, maxMs: number } }) {
  return {
    readyPattern: cfg.ready.logPattern ? new RegExp(cfg.ready.logPattern, 'i') : undefined,
    readyPort   : cfg.ready.tcpPort,
    quietMs     : cfg.ready.quietMs,
    maxMs       : cfg.ready.maxMs,
  }
}

/** The subset (pattern/port) used by the state-only `probeReadyNow`. */
function probeSignals(cfg: { ready: { logPattern?: string, tcpPort?: number } }) {
  return {
    pattern: cfg.ready.logPattern ? new RegExp(cfg.ready.logPattern, 'i') : undefined,
    port   : cfg.ready.tcpPort,
  }
}

function reportResolveFailures(failures: ReturnType<typeof resolveMods>['failures']): boolean {
  for (const f of failures) {
    if (f.kind === 'notfound') consola.error(`mod not found: "${f.query}"`)
    else consola.error(`ambiguous query "${f.query}" → ${f.candidates.map(c => c.displayName).join(', ')} (be more specific)`)
  }
  return failures.length > 0
}

function logPlan(plan: ActionPlan, dry: boolean): void {
  const tag = dry ? ' (assumed)' : ''
  for (const m of plan.toDisable) consola.log(`  disabled${tag}: ${m.displayName} ◂${m.fileNameNoExt}▸`)
  for (const m of plan.toEnable) consola.log(`  enabled${tag}:  ${m.displayName} ◂${m.fileNameNoExt}▸`)
}

function printRoster(mods: Mod[]): void {
  out(summarizeRoster(mods))
}

/**
 * Warn about pack capabilities lost with a disabled mod (config `capabilities`).
 * Never fatal — the game boots fine without them; the point is that an agent
 * driving a reduced mod set learns e.g. that in-game commands are gone *now*,
 * instead of from a puzzling timeout later.
 */
export function warnLostCapabilities(mods: Mod[], capabilities: Capability[]): void {
  for (const cap of capabilities) {
    const r = resolveMod(mods, cap.mod)
    if (r.kind === 'ok' && r.mod.enabled) continue
    if (r.kind === 'ambiguous' && r.candidates.some(m => m.enabled)) continue
    const name = r.kind === 'ok' ? r.mod.displayName : cap.mod
    const state = r.kind === 'notfound' ? 'is not installed' : 'is disabled'
    consola.warn(`${name} ${state} — ${cap.provides} unavailable.`)
  }
}

/** Report an interrupted/drifted prior session; returns true if the caller must abort. */
function reportGuardBlock(guard: ReturnType<typeof guardSession>): boolean {
  if (guard.mode === 'interrupted') {
    consola.error('a previous reducer operation was interrupted. Resume with --continue or discard with --new.')
    return true
  }
  if (guard.mode === 'drift') {
    consola.error('the modpack changed since the interrupted session — resuming is unsafe.')
    if (guard.drift.missing.length) consola.error(`  renamed/removed: ${guard.drift.missing.join(', ')}`)
    if (guard.drift.added.length) consola.error(`  added: ${guard.drift.added.join(', ')}`)
    consola.error('  start over with --new.')
    return true
  }
  return false
}

export interface ActionInput {
  mcPath   : string
  kind     : ActionKind
  queries  : string[]
  dry      : boolean
  continue?: boolean
  new?     : boolean
  /** Print the ⚠ "prefer a combined command" advice (standalone verbs). */
  advise?  : boolean
}

/** disable / enable / only / except (and `full` via restart). */
export async function runAction(input: ActionInput): Promise<number> {
  const { mcPath, kind, queries, dry } = input
  const runtime = await loadRuntime(mcPath)

  const guard = guardSession(mcPath, runtime.mods, { continue: input.continue, new: input.new })
  if (reportGuardBlock(guard)) return 1

  let targets: Mod[] = []
  if (kind !== 'full') {
    const { mods, failures } = resolveMods(runtime.mods, queries)
    if (reportResolveFailures(failures)) return 1
    if (mods.length === 0) {
      consola.error('no mods given')
      return 1
    }
    targets = mods
  }

  const plan = computeAction(runtime.mods, kind, targets)
  writeSession(mcPath, {
    phase   : 'applying',
    snapshot: snapshotMods(runtime.mods),
    plan    : { toEnable: plan.toEnable.map(m => m.fileNameNoExt), toDisable: plan.toDisable.map(m => m.fileNameNoExt) },
  })

  const res = await applyPlan(plan, dry)
  logPlan(plan, dry)
  for (const f of res.failed) consola.error(`failed: ${f.mod.fileNameNoExt} — ${f.error}`)

  clearSession(mcPath)
  printRoster(runtime.mods)

  if (input.advise) {
    consola.warn(`tip: combine actions with a restart — \`mctools-reducer restart --${kind} ${queries.map(q => JSON.stringify(q)).join(' ')}\` applies and reboots in one step.`)
  }
  return res.failed.length ? 1 : 0
}

export interface RestartInput {
  mcPath   : string
  dry      : boolean
  full     : boolean
  disable  : string[]
  enable   : string[]
  only     : string[]
  except   : string[]
  continue?: boolean
  new?     : boolean
  /** Launch and return immediately; poll readiness with `reducer ready`. */
  detach?  : boolean
  /** Treat post-load log ERROR/FATAL as failure (exit 1) instead of a warning. */
  strict?  : boolean
}

export async function runRestart(input: RestartInput): Promise<number> {
  const { mcPath, dry } = input
  const runtime = await loadRuntime(mcPath)

  const modes = ([
    ['disable', input.disable],
    ['enable', input.enable],
    ['only', input.only],
    ['except', input.except],
  ] as const).filter(([, v]) => v.length > 0)

  let plan: ActionPlan | undefined

  if (input.full) {
    if (modes.length) {
      consola.error('--full cannot be combined with --disable/--enable/--only/--except')
      return 1
    }
    plan = computeAction(runtime.mods, 'full', [])
  }
  else if (modes.length === 0) {
    plan = { toEnable: [], toDisable: [] } // plain restart: keep current state
  }
  else if (modes.length === 1) {
    const [kind, queries] = modes[0]
    const { mods, failures } = resolveMods(runtime.mods, queries)
    if (reportResolveFailures(failures)) return 1
    plan = computeAction(runtime.mods, kind, mods)
  }
  else if (modes.length === 2 && input.disable.length && input.enable.length) {
    const dis = resolveMods(runtime.mods, input.disable)
    const en = resolveMods(runtime.mods, input.enable)
    if (reportResolveFailures([...dis.failures, ...en.failures])) return 1
    const combined = computeCombined(dis.mods, en.mods)
    if (isConflict(combined)) {
      consola.error(`self-excluding request: ${combined.conflict.map(m => m.displayName).join(', ')} would need to be both enabled and disabled (a dependency/dependent conflict).`)
      return 1
    }
    plan = combined
  }
  else {
    consola.error('only --disable + --enable may be combined; --only/--except must be used alone')
    return 1
  }

  // A plain reboot renames no jars, so it needs no session lock — locking it was
  // the cause of the "interrupted session" deadlock when a slow boot got killed.
  // Only guard the (millisecond) jar-rename window; release the lock before the
  // long boot so a killed monitor can never poison the session.
  const mutates = plan.toEnable.length > 0 || plan.toDisable.length > 0

  if (mutates) {
    const guard = guardSession(mcPath, runtime.mods, { continue: input.continue, new: input.new })
    if (reportGuardBlock(guard)) return 1

    writeSession(mcPath, {
      phase   : 'applying',
      snapshot: snapshotMods(runtime.mods),
      plan    : { toEnable: plan.toEnable.map(m => m.fileNameNoExt), toDisable: plan.toDisable.map(m => m.fileNameNoExt) },
    })

    const res = await applyPlan(plan, dry)
    logPlan(plan, dry)
    for (const f of res.failed) consola.error(`failed: ${f.mod.fileNameNoExt} — ${f.error}`)
    if (res.failed.length) {
      consola.error('aborting restart — free the locked file(s) and rerun with --continue.')
      return 1 // session kept for --continue
    }
    clearSession(mcPath) // jars consistent — no lock held across the boot
  }
  else {
    // No mutation: a stale interrupted session (from an earlier aborted mod change)
    // shouldn't block a plain reboot. --new clears it; otherwise just warn.
    const prev = readSession(mcPath)
    if (input.new) clearSession(mcPath)
    else if (prev && prev.phase !== 'idle') consola.warn('note: an earlier mod-set change was left interrupted (`reducer restart --new` clears that record). Rebooting current state.')
  }

  printRoster(runtime.mods)
  warnLostCapabilities(runtime.mods, runtime.config.capabilities)

  if (dry) {
    consola.info('dry run — Minecraft not restarted (assumed).')
    return 0
  }

  const launcher = resolveLauncher(mcPath, runtime.config.launcher)
  const signals = readySignals(runtime.config)

  // ----- detached restart: launch and return fast, caller polls `reducer ready` -----
  if (input.detach) {
    consola.start(`restarting via ${launcher.name} … (detached)`)
    const existing = await launcher.getPid()
    if (existing) {
      await launcher.kill(existing)
      consola.log(`killed existing ${launcher.name} PID ${existing}`)
    }
    await sleep(3000) // let the OS release file handles before relaunch
    await launcher.launch()
    consola.success(`launched via ${launcher.name}: ${await describeLauncher(launcher)}. Poll with \`reducer ready\` (or \`reducer ready --wait\`).`)
    return 0
  }

  // ----- blocking restart + monitor (no session lock held) -----
  consola.start(`restarting via ${launcher.name} …`)
  // A wedged boot used to print the same heartbeat as a healthy one, so it read as
  // progress for as long as the operator was willing to wait. Name the stall instead.
  let hinted = false
  const result = await restartAndMonitor(mcPath, launcher, {
    ...signals,
    log       : m => consola.log(m),
    onProgress: ({ elapsed, lastLine, stalledMs }) => {
      const stall = stalledMs >= STALL_WARN_MS ? ` · no log output for ${fmtSec(stalledMs)}` : ''
      consola.log(`  booting ${fmtSec(elapsed)}${stall} · ${trimLine(lastLine)}`)
      const hint = !hinted && stalledMs >= STALL_WARN_MS ? stallHint(lastLine) : null
      if (hint) {
        hinted = true
        consola.warn(`stalled here: ${hint}`)
      }
    },
  })
  /** Name the boot stage a failed launch froze on, and why it can freeze there. */
  const explainStage = () => {
    if (!result.lastLine) return
    consola.info(`last log line: ${trimLine(result.lastLine)}`)
    const hint = stallHint(result.lastLine)
    if (hint) consola.info(hint)
  }

  // ── Block 1: did it load? (liveness — the exit code follows this) ──
  if (result.outcome === 'crash') {
    consola.error('LOAD ✗ Minecraft crashed:')
    if (result.crashSummary) process.stderr.write(`${result.crashSummary}\n`)
    return 1
  }
  if (result.outcome === 'exit') {
    consola.error('LOAD ✗ Minecraft process exited unexpectedly (no crash report).')
    if (result.crashSummary) process.stderr.write(`${result.crashSummary}\n`)
    explainStage()
    return 1
  }
  if (result.outcome === 'timeout') {
    consola.warn(`LOAD ✗ monitor ceiling (${fmtSec(signals.maxMs)}) reached with no ready signal — still booting, hung, or too slow. Raise ready.maxMs / REDUCER_MONITOR_MAX_MS if the pack just needs longer.`)
    explainStage()
    return 1
  }
  const how = result.reached === 'pattern'
    ? 'ready line seen — in world'
    : result.reached === 'port'
      ? 'ready port open'
      : 'reached main menu (no world auto-joined)'
  consola.success(`LOAD ✔ Minecraft loaded (${how}).`)

  // ── Block 2: are the scripts clean? (warning-only unless --strict) ──
  const scanned = runtime.config.scan
  const scan = await scanLogErrors(mcPath, scanned)
  if (scan.count > 0) {
    consola.warn(`SCRIPTS ⚠ ${scan.count} ERROR/FATAL line(s) in ${scanned.join(', ')}${input.strict ? '' : ' (warning — pass --strict to fail on these)'}:`)
    for (const l of scan.lines.slice(0, 50)) out(l)
    if (scan.lines.length > 50) out(`…and ${scan.lines.length - 50} more`)
    return input.strict ? 1 : 0
  }
  consola.success(`SCRIPTS ✔ no ERROR/FATAL in ${scanned.join(', ') || '(nothing configured to scan)'}.`)
  return 0
}

export interface ReadyInput {
  mcPath : string
  wait   : boolean
  timeout: number
}

/** Answer "is the game loaded & ready for commands right now?" — mod-agnostic. */
export async function runReady(input: ReadyInput): Promise<number> {
  const runtime = await loadRuntime(input.mcPath)
  const launcher = resolveLauncher(input.mcPath, runtime.config.launcher)
  const signals = probeSignals(runtime.config)

  if (!input.wait) {
    const v = await probeReadyNow(input.mcPath, signals, launcher)
    if (v.ready) consola.success(`ready ✔ ${v.reason}`)
    else consola.warn(`not ready ✗ ${v.reason}`)
    return v.ready ? 0 : 1
  }

  const v = await waitUntilReady(input.mcPath, signals, launcher, {
    timeoutMs: input.timeout,
    // The boot that precedes this call is the only one that can be blamed.
    since    : Date.now() - 60_000,
  })
  if (v.outcome === 'ready') {
    consola.success(`ready ✔ ${v.reason}`)
    return 0
  }
  if (v.outcome === 'dead') {
    consola.error(`LOAD ✗ ${v.reason} — not waiting out the timeout.`)
    if (v.diagnostics) process.stderr.write(`${v.diagnostics}\n`)
    else consola.warn('nothing in crash-reports/ or debug.log explains it — check the launcher console.')
    return 1
  }
  consola.warn(`not ready ✗ ${v.reason} (gave up after ${fmtSec(input.timeout)})`)
  return 1
}

export async function runKill(mcPath: string, dry: boolean): Promise<number> {
  const runtime = await loadRuntime(mcPath)
  const launcher = resolveLauncher(mcPath, runtime.config.launcher)
  const pid = await launcher.getPid()
  if (!pid) {
    consola.warn('Minecraft is not running — nothing to kill.')
    return 0
  }
  if (dry) {
    consola.info(`would kill ${launcher.name} PID ${pid} (assumed).`)
    return 0
  }
  await launcher.kill(pid)
  consola.success(`killed ${launcher.name} PID ${pid}.`)
  consola.warn('tip: prefer `restart` to reboot the game in one step.')
  return 0
}

export interface FindInput {
  mcPath      : string
  queries     : string[]
  dependencies: boolean
  dependents  : boolean
}

export async function runFind(input: FindInput): Promise<number> {
  const runtime = await loadRuntime(input.mcPath)
  const lines = formatFind(runtime.mods, input.queries, {
    dependencies: input.dependencies,
    dependents  : input.dependents,
  })
  for (const l of lines) out(l)
  return lines.some(l => l.includes('<not found>') || l.includes('<ambiguous')) ? 1 : 0
}

/** Print the non-interactive equivalents of the dashboard panels. */
export async function runStatus(mcPath: string): Promise<number> {
  const runtime = await loadRuntime(mcPath)
  // Lead with liveness so "what's happening right now" is the first line.
  const launcher = resolveLauncher(mcPath, runtime.config.launcher)
  const v = await probeReadyNow(mcPath, probeSignals(runtime.config), launcher)
  out(`GAME  ${v.ready ? 'ready' : 'not ready'} — ${v.reason}`)
  out(summarizeRoster(runtime.mods))
  warnLostCapabilities(runtime.mods, runtime.config.capabilities)
  for (const l of summarizeDiagnostics(runtime.warnings)) out(l)
  for (const l of summarizeWeight(runtime.mods)) out(l)
  return 0
}

export interface BinaryInput {
  mcPath    : string
  configPath: string
  dry       : boolean
  force     : boolean
  trusted   : string[]
  ignored   : string[]
  continue? : boolean
  new?      : boolean
}

export async function runBinary(input: BinaryInput): Promise<number> {
  const { mcPath, dry, force } = input
  const runtime = await loadRuntime(mcPath)

  const guard = guardSession(mcPath, runtime.mods, { continue: input.continue, new: input.new })
  if (guard.mode === 'interrupted') {
    consola.error('a previous binary search was interrupted. Resume with --continue or discard with --new.')
    return 1
  }
  if (guard.mode === 'drift') {
    consola.error('the modpack changed since the interrupted session — resuming is unsafe.')
    if (guard.drift.missing.length) consola.error(`  renamed/removed: ${guard.drift.missing.join(', ')}`)
    if (guard.drift.added.length) consola.error(`  added: ${guard.drift.added.join(', ')}`)
    consola.error('  start over with --new.')
    return 1
  }

  let conditions
  try {
    conditions = await loadConditions(input.configPath)
  }
  catch (e) {
    consola.error(e instanceof Error ? e.message : String(e))
    return 1
  }

  const validation = await validateConditions(conditions, mcPath)
  for (const w of validation.warnings) consola.warn(w)
  if (!validation.ok) {
    for (const err of validation.errors) consola.error(err)
    if (!force) {
      consola.error('config validation failed — fix the conditions or pass --force to bypass.')
      return 1
    }
    consola.warn('--force: ignoring config validation problems.')
  }

  const trusted = resolveMods(runtime.mods, input.trusted)
  const ignored = resolveMods(runtime.mods, input.ignored)
  if (reportResolveFailures([...trusted.failures, ...ignored.failures])) return 1

  const launcher = resolveLauncher(mcPath, runtime.config.launcher)

  const result = await runAutoBinary({
    mcDir     : mcPath,
    mods      : runtime.mods,
    conditions,
    launcher,
    dry,
    trusted   : trusted.mods,
    ignored   : ignored.mods,
    log       : m => consola.log(m),
    onProgress: (status, iterations) => {
      writeSession(mcPath, {
        phase   : 'bisecting',
        snapshot: snapshotMods(runtime.mods),
        binary  : {
          configPath: input.configPath,
          statuses  : Object.fromEntries([...status].map(([m, s]) => [m.fileNameNoExt, s])),
          iterations,
        },
      })
    },
  })

  if (result.outcome === 'culprit' && result.culprit) {
    consola.success(`CULPRIT FOUND: ${result.culprit.displayName} ◂${result.culprit.fileNameNoExt}▸`)
    out(`culprit: ./mods/${result.culprit.fileName}`)
    clearSession(mcPath)
    return 0
  }
  if (result.outcome === 'aborted') {
    consola.error(result.message ?? 'aborted')
    // session is intentionally left in place for --continue
    return 1
  }
  consola.warn(`inconclusive: ${result.message ?? result.outcome}`)
  clearSession(mcPath)
  return 1
}
