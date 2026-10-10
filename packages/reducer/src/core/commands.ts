import type { Capability, ReadyConfig } from '../config.js'
import type { Mod } from '../Mod.js'
import type { ActionKind, ActionPlan } from './modActions.js'
import type { Target } from './target.js'
import { openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { runAutoBinary } from '../binary/auto.js'
import { loadConditions } from '../binary/conditions.js'
import { validateConditions } from '../binary/validate.js'
import { describeLauncher, probeReadyNow, restartAndMonitor, scanLogErrors, stallHint, waitUntilReady } from '../launcher/index.js'
import { placeGameWindow } from '../launcher/place-window.js'
import {
  clearSession,
  readSession,
  snapshotMods,
  writeSession,
} from '../session/lock.js'
import { formatFind } from './find.js'
import { applyPlan, computeAction, computeCombined, isConflict } from './modActions.js'
import { ensurePatchCheckForBoot, restorePatchCheckFlag } from './patchCheck.js'
import { resolveMod, resolveMods } from './resolve.js'
import { loadRuntime } from './runtime.js'
import { guardSession } from './session.js'
import { summarizeDiagnostics, summarizeRoster, summarizeWeight } from './summaries.js'
import { openTarget, summarizeProvision } from './target.js'

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

/** How long the post-launch placer waits for the game window (test launches). */
const PLACE_WINDOW_MS = 180_000

/**
 * Move the game window to the test corner (top-right of the tallest monitor).
 * Client only — a dedicated server has no window. Never fails the restart:
 * placement problems are warnings. In detached mode the placer re-invokes
 * itself detached so the fast return stays fast.
 */
function kickPlaceWindow(detached: boolean): void {
  if (process.platform !== 'win32') return
  if (detached) {
    import('node:child_process').then(({ spawn }) => {
      const child = spawn(process.execPath, [process.argv[1]!, 'place-window'], {
        detached: true, stdio: 'ignore',
      })
      child.unref()
    }).catch(() => {})
    return
  }
  void placeGameWindow({ waitMs: PLACE_WINDOW_MS })
    .then((p) => consola.success(`window placed at ${p.x},${p.y} (${p.w}x${p.h})`))
    .catch((e) => consola.warn(`window not placed: ${(e as Error).message}`))
}

/**
 * Detached patch-check restore: a blocking caller restores the flag itself
 * after the monitor ends, but a detached launch returns in seconds — so the
 * wait-for-read + restore runs as a detached self re-invocation (same shape
 * as the detached place-window kick). The flip itself was already announced
 * by ensurePatchCheckForBoot, so a lost watcher can only delay the restore,
 * never silence the message.
 */
function kickPatchCheckRestore(gameDir: string): void {
  import('node:child_process').then(({ spawn }) => {
    const log = openSync(join(tmpdir(), 'mctools-patch-check.log'), 'a')
    const child = spawn(process.execPath, [
      process.argv[1],
      'restore-patch-check',
      '--cwd',
      gameDir,
    ], {
      detached: true,
      stdio   : ['ignore', log, log],
    })
    child.unref()
    child.on('error', () => {})
  }).catch(() => {})
}

function trimLine(s: string, max = 100): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** Readiness config → monitor signals (all mod-agnostic, layers optional). */
function readySignals(ready: ReadyConfig) {
  return {
    readyPattern: ready.logPattern ? new RegExp(ready.logPattern, 'i') : undefined,
    readyPort   : ready.tcpPort,
    quietMs     : ready.quietMs,
    maxMs       : ready.maxMs,
  }
}

/** The subset (pattern/port) used by the state-only `probeReadyNow`. */
function probeSignals(ready: ReadyConfig) {
  return {
    pattern: ready.logPattern ? new RegExp(ready.logPattern, 'i') : undefined,
    port   : ready.tcpPort,
  }
}

/** The pack's roster for whichever game `target` names. */
async function rosterOf(target: Target) {
  return loadRuntime(target.gameDir, { packPath: target.packDir, config: target.config })
}

/** Say what the server dir was brought to, before anything acts on it. */
function reportProvision(target: Target): void {
  if (target.provisioned) out(summarizeProvision(target.provisioned))
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
  /** Act on the pack's dedicated server instead of its client. */
  server?  : boolean
  continue?: boolean
  new?     : boolean
  /** Print the ⚠ "prefer a combined command" advice (standalone verbs). */
  advise?  : boolean
}

/** disable / enable / only / except (and `full` via restart). */
export async function runAction(input: ActionInput): Promise<number> {
  const { mcPath, kind, queries, dry } = input
  const target = await openTarget({ mcPath, server: input.server, provision: true, dry })
  reportProvision(target)
  const runtime = await rosterOf(target)

  const guard = guardSession(target.gameDir, runtime.mods, { continue: input.continue, new: input.new })
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
  writeSession(target.gameDir, {
    phase   : 'applying',
    snapshot: snapshotMods(runtime.mods),
    plan    : { toEnable: plan.toEnable.map(m => m.fileNameNoExt), toDisable: plan.toDisable.map(m => m.fileNameNoExt) },
  })

  const res = await applyPlan(plan, dry)
  logPlan(plan, dry)
  for (const f of res.failed) consola.error(`failed: ${f.mod.fileNameNoExt} — ${f.error}`)

  clearSession(target.gameDir)
  printRoster(runtime.mods)

  if (input.advise) {
    consola.warn(`tip: combine actions with a restart — \`mctools-reducer restart --${kind} ${queries.map(q => JSON.stringify(q)).join(' ')}\` applies and reboots in one step.`)
  }
  return res.failed.length ? 1 : 0
}

export interface RestartInput {
  mcPath    : string
  dry       : boolean
  full      : boolean
  disable   : string[]
  enable    : string[]
  only      : string[]
  except    : string[]
  continue? : boolean
  new?      : boolean
  /** Launch and return immediately; poll readiness with `reducer ready`. */
  detach?   : boolean
  /** Treat post-load log ERROR/FATAL as failure (exit 1) instead of a warning. */
  strict?   : boolean
  /** Boot the pack's dedicated server instead of its client. */
  server?   : boolean
  /** Server only: re-run the loader installer before booting. */
  reinstall?: boolean
}

export async function runRestart(input: RestartInput): Promise<number> {
  const { mcPath, dry } = input
  const target = await openTarget({ mcPath, server: input.server, provision: true, dry, reinstall: input.reinstall })
  reportProvision(target)
  const runtime = await rosterOf(target)

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
    const guard = guardSession(target.gameDir, runtime.mods, { continue: input.continue, new: input.new })
    if (reportGuardBlock(guard)) return 1

    writeSession(target.gameDir, {
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
    clearSession(target.gameDir) // jars consistent — no lock held across the boot
  }
  else {
    // No mutation: a stale interrupted session (from an earlier aborted mod change)
    // shouldn't block a plain reboot. --new clears it; otherwise just warn.
    const prev = readSession(target.gameDir)
    if (input.new) clearSession(target.gameDir)
    else if (prev && prev.phase !== 'idle') consola.warn('note: an earlier mod-set change was left interrupted (`reducer restart --new` clears that record). Rebooting current state.')
  }

  printRoster(runtime.mods)
  warnLostCapabilities(runtime.mods, target.capabilities)

  // Scalar/Fugue "press any key" block: with those mods absent the boot stalls
  // before any mod loads, so flip the check off now (announced out loud) and
  // restore it once the boot is past the read — or right after, in all cases.
  // Runs before the dry early-return so dry runs still report the flip.
  const patch = await ensurePatchCheckForBoot(target.gameDir, runtime.mods, { dry })

  if (dry) {
    consola.info(`dry run — ${target.isServer ? 'the server was' : 'Minecraft was'} not restarted (assumed).`)
    return 0
  }

  const launcher = target.launcher
  const signals = readySignals(target.ready)

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
    if (!target.isServer) kickPlaceWindow(true)
    if (patch.flipped) kickPatchCheckRestore(target.gameDir)
    consola.success(`launched via ${launcher.name}: ${await describeLauncher(launcher)}. Poll with \`reducer ready\` (or \`reducer ready --wait\`).`)
    return 0
  }

  // ----- blocking restart + monitor (no session lock held) -----
  consola.start(`restarting via ${launcher.name} …`)
  if (!target.isServer) kickPlaceWindow(false) // float while booting; warns on failure
  // A wedged boot used to print the same heartbeat as a healthy one, so it read as
  // progress for as long as the operator was willing to wait. Name the stall instead.
  let hinted = false
  const result = await restartAndMonitor(target.gameDir, launcher, {
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
  // The monitor ending (idle/crash/exit/timeout) always postdates the check
  // read — the check runs in the FML handler constructor, before mod loading
  // logs anything — so restore now in every outcome. A boot that never
  // launched never read the value either, and restoring still leaves the tree
  // exactly as found.
  if (patch.flipped) await restorePatchCheckFlag(target.gameDir, { dry })
  /** Name the boot stage a failed launch froze on, and why it can freeze there. */
  const explainStage = () => {
    if (!result.lastLine) return
    consola.info(`last log line: ${trimLine(result.lastLine)}`)
    const hint = stallHint(result.lastLine)
    if (hint) consola.info(hint)
  }

  // ── Block 1: did it load? (liveness — the exit code follows this) ──
  const game = target.isServer ? 'the server' : 'Minecraft'
  if (result.outcome === 'crash') {
    consola.error(`LOAD ✗ ${game} crashed:`)
    if (result.crashSummary) process.stderr.write(`${result.crashSummary}\n`)
    return 1
  }
  if (result.outcome === 'exit') {
    consola.error(`LOAD ✗ ${game} process exited unexpectedly (no crash report).`)
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
    ? target.isServer ? 'server accepting players' : 'ready line seen — in world'
    : result.reached === 'port'
      ? 'ready port open'
      : target.isServer ? 'mods loaded (log went quiet)' : 'reached main menu (no world auto-joined)'
  consola.success(`LOAD ✔ ${game} loaded (${how}).`)

  // ── Block 2: are the scripts clean? (warning-only unless --strict) ──
  const scanned = runtime.config.scan
  const scan = await scanLogErrors(target.gameDir, scanned)
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
  /** Ask about the pack's dedicated server instead of its client. */
  server?: boolean
}

/** Answer "is the game loaded & ready for commands right now?" — mod-agnostic. */
export async function runReady(input: ReadyInput): Promise<number> {
  // Read-only: never provision, so asking about a server that was never built
  // answers "not running" instead of installing a loader behind the user's back.
  const target = await openTarget({ mcPath: input.mcPath, server: input.server })
  const launcher = target.launcher
  const signals = probeSignals(target.ready)

  if (!input.wait) {
    const v = await probeReadyNow(target.gameDir, signals, launcher)
    if (v.ready) consola.success(`ready ✔ ${v.reason}`)
    else consola.warn(`not ready ✗ ${v.reason}`)
    return v.ready ? 0 : 1
  }

  const v = await waitUntilReady(target.gameDir, signals, launcher, {
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

export async function runKill(mcPath: string, dry: boolean, server = false): Promise<number> {
  const target = await openTarget({ mcPath, server })
  const launcher = target.launcher
  const pid = await launcher.getPid()
  if (!pid) {
    consola.warn(`${target.isServer ? 'The server' : 'Minecraft'} is not running — nothing to kill.`)
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
  /** Resolve against the server's mod set instead of the client's. */
  server?     : boolean
}

export async function runFind(input: FindInput): Promise<number> {
  const target = await openTarget({ mcPath: input.mcPath, server: input.server, provision: true })
  const runtime = await rosterOf(target)
  const lines = formatFind(runtime.mods, input.queries, {
    dependencies: input.dependencies,
    dependents  : input.dependents,
  })
  for (const l of lines) out(l)
  return lines.some(l => l.includes('<not found>') || l.includes('<ambiguous')) ? 1 : 0
}

/**
 * Print the non-interactive equivalents of the dashboard panels. With
 * `--server` this doubles as the provision-only command: the game dir is
 * brought up to date and reported on, but nothing is launched.
 */
export async function runStatus(mcPath: string, server = false): Promise<number> {
  const target = await openTarget({ mcPath, server, provision: true })
  reportProvision(target)
  const runtime = await rosterOf(target)
  // Lead with liveness so "what's happening right now" is the first line.
  const launcher = target.launcher
  const v = await probeReadyNow(target.gameDir, probeSignals(target.ready), launcher)
  out(`GAME  ${v.ready ? 'ready' : 'not ready'} — ${v.reason}`)
  out(summarizeRoster(runtime.mods))
  warnLostCapabilities(runtime.mods, target.capabilities)
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
  /** Bisect the pack's dedicated server instead of its client. */
  server?   : boolean
}

export async function runBinary(input: BinaryInput): Promise<number> {
  const { mcPath, dry, force } = input
  const target = await openTarget({ mcPath, server: input.server, provision: true, dry })
  reportProvision(target)
  const runtime = await rosterOf(target)

  const guard = guardSession(target.gameDir, runtime.mods, { continue: input.continue, new: input.new })
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

  const validation = await validateConditions(conditions, target.gameDir)
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

  const result = await runAutoBinary({
    mcDir     : target.gameDir,
    mods      : runtime.mods,
    conditions,
    launcher  : target.launcher,
    dry,
    trusted   : trusted.mods,
    ignored   : ignored.mods,
    log       : m => consola.log(m),
    onProgress: (status, iterations) => {
      writeSession(target.gameDir, {
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
    clearSession(target.gameDir)
    return 0
  }
  if (result.outcome === 'aborted') {
    consola.error(result.message ?? 'aborted')
    // session is intentionally left in place for --continue
    return 1
  }
  consola.warn(`inconclusive: ${result.message ?? result.outcome}`)
  clearSession(target.gameDir)
  return 1
}
