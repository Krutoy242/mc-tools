import type { Mod } from '../Mod.js'
import type { ActionKind, ActionPlan } from './modActions.js'
import process from 'node:process'
import consola from 'consola'
import { runAutoBinary } from '../binary/auto.js'
import { loadConditions } from '../binary/conditions.js'
import { validateConditions } from '../binary/validate.js'
import { readCraftTweakerErrors, resolveLauncher, restartAndMonitor } from '../launcher/index.js'
import {
  clearSession,
  snapshotMods,
  writeSession,
} from '../session/lock.js'
import { formatFind } from './find.js'
import { applyPlan, computeAction, computeCombined, isConflict } from './modActions.js'
import { resolveMods } from './resolve.js'
import { loadRuntime } from './runtime.js'
import { guardSession } from './session.js'
import { summarizeDiagnostics, summarizeRoster, summarizeWeight } from './summaries.js'

/** Primary, parseable output → stdout. Diagnostics go through consola (stderr). */
function out(line: string): void {
  process.stdout.write(`${line}\n`)
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

export interface ActionInput {
  mcPath : string
  kind   : ActionKind
  queries: string[]
  dry    : boolean
  /** Print the ⚠ "prefer a combined command" advice (standalone verbs). */
  advise?: boolean
}

/** disable / enable / only / except (and `full` via restart). */
export async function runAction(input: ActionInput): Promise<number> {
  const { mcPath, kind, queries, dry } = input
  const runtime = await loadRuntime(mcPath)

  const guard = guardSession(mcPath, runtime.mods, {})
  if (guard.mode === 'interrupted') {
    consola.error('a previous reducer operation was interrupted. Resume with --continue or discard with --new.')
    return 1
  }

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
  mcPath : string
  dry    : boolean
  full   : boolean
  disable: string[]
  enable : string[]
  only   : string[]
  except : string[]
}

export async function runRestart(input: RestartInput): Promise<number> {
  const { mcPath, dry } = input
  const runtime = await loadRuntime(mcPath)

  const guard = guardSession(mcPath, runtime.mods, {})
  if (guard.mode === 'interrupted') {
    consola.error('a previous reducer operation was interrupted. Resume with --continue or discard with --new.')
    return 1
  }

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
    return 1
  }

  printRoster(runtime.mods)

  if (dry) {
    consola.info('dry run — Minecraft not restarted (assumed).')
    clearSession(mcPath)
    return 0
  }

  // ----- real restart + monitor -----
  const launcher = resolveLauncher(mcPath, runtime.config.launcher)
  writeSession(mcPath, { phase: 'restarting', snapshot: snapshotMods(runtime.mods) })
  consola.start(`restarting via ${launcher.name} …`)
  const result = await restartAndMonitor(mcPath, launcher, { log: m => consola.log(m) })
  clearSession(mcPath)

  if (result.outcome === 'crash') {
    consola.error('Minecraft crashed:')
    if (result.crashSummary) process.stderr.write(`${result.crashSummary}\n`)
    return 1
  }
  if (result.outcome === 'exit') {
    consola.error('Minecraft process exited unexpectedly (no crash report).')
    return 1
  }
  if (result.outcome === 'timeout') {
    consola.warn('monitor ceiling reached before the game went idle.')
  }
  else {
    consola.success('Minecraft reached idle (loaded).')
  }

  const ct = await readCraftTweakerErrors(mcPath)
  if (ct.count > 0) {
    consola.warn(`${ct.count} ERROR/FATAL lines in crafttweaker.log:`)
    for (const l of ct.lines.slice(0, 50)) out(l)
    if (ct.lines.length > 50) out(`…and ${ct.lines.length - 50} more`)
    return 1
  }
  consola.success('no ERROR/FATAL in crafttweaker.log')
  return 0
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
  out(summarizeRoster(runtime.mods))
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
