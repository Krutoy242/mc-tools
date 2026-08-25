import type { Launcher, MonitorResult } from './types.js'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import net from 'node:net'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'
import { join } from 'pathe'
import { describeLauncher } from './types.js'

const TICK_MS = 1000
const HEALTH_MS = 3000
// Full-pack boots can take well over 5 min; a short ceiling was the main cause of
// false "timeout" reports. Overridable via REDUCER_MONITOR_MAX_MS.
const DEFAULT_MAX_MS = 900_000
const DEFAULT_QUIET_MS = 8000
const DEFAULT_LAUNCH_MS = 120_000
const PORT_PROBE_MS = 2000 // don't hammer the socket every tick
// Universal Forge signal, present in EVERY Forge launch even with zero extra mods.
// Marks "mods finished loading / main menu imminent" — the mod-agnostic anchor for
// the readiness fallbacks. NOT a mod-specific line.
const FML_LOADED = /Forge Mod Loader has successfully loaded/i
// A boot that writes nothing for this long is worth calling out: the progress
// heartbeat repeats the same stale line, so without this a frozen launch and a
// slow one look identical.
const STALL_MS = 45_000

/**
 * Boot stages that legitimately go silent for minutes, and what the operator
 * needs to know while staring at a frozen progress line. Matched against the
 * last `debug.log` line — the only evidence there is while nothing is written.
 */
const STALL_HINTS: { match: RegExp, hint: string }[] = [
  {
    match: /CleanroomRelauncher|Preparing Cleanroom|JavaProvisioner/i,
    hint : 'the Cleanroom relauncher is fetching Cleanroom and its libraries. That is a download, not a hang — but the JVM ignores HTTP(S)_PROXY, so behind a proxy-only connection it stalls here forever. Watch ~/.cleanroom/relauncher for a growing *.tmp; if it never grows, add -Dhttps.proxyHost/-Dhttps.proxyPort to the launcher JVM args.',
  },
]

/** Known cause for a boot frozen on `lastLine`, or `null` if we have no idea. */
export function stallHint(lastLine: string): string | null {
  return STALL_HINTS.find(h => h.match.test(lastLine))?.hint ?? null
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

/** How long `filePath` has gone without being written to (0 if it is missing). */
async function quietFor(filePath: string): Promise<number> {
  try {
    return Math.max(0, Date.now() - (await fs.stat(filePath)).mtimeMs)
  }
  catch {
    return 0
  }
}

/** Last non-empty line of a text blob, trimmed. */
function lastLineOf(text: string): string {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim()
    if (t) return t
  }
  return ''
}

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** True if something accepts a TCP connection on `port` (mod-agnostic liveness probe). */
export async function tcpOpen(port: number, host = '127.0.0.1', timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

export function dbgLogPath(mcDir: string): string {
  return join(mcDir, 'logs', 'debug.log')
}

export function ctLogPath(mcDir: string): string {
  return join(mcDir, 'crafttweaker.log')
}

interface LogTail {
  pos    : number
  pending: string
  decoder: StringDecoder
}

function createTail(startPos = 0): LogTail {
  return { pos: startPos, pending: '', decoder: new StringDecoder('utf8') }
}

/** Read newly appended, newline-terminated lines. Handles truncation/rotation. */
async function readNewLines(filePath: string, tail: LogTail): Promise<string[]> {
  let size: number
  try {
    size = (await fs.stat(filePath)).size
  }
  catch {
    return []
  }
  if (size < tail.pos) {
    tail.pos = 0
    tail.pending = ''
    tail.decoder = new StringDecoder('utf8')
  }
  if (size <= tail.pos) return []

  const len = size - tail.pos
  const buffer = Buffer.alloc(len)
  let bytesRead = 0
  const fd = await fs.open(filePath, 'r')
  try {
    ;({ bytesRead } = await fd.read(buffer, 0, len, tail.pos))
  }
  finally {
    await fd.close()
  }
  tail.pos += bytesRead

  const text = tail.pending + tail.decoder.write(buffer.subarray(0, bytesRead))
  const parts = text.split('\n')
  tail.pending = parts.pop() ?? ''
  return parts.map(l => l.endsWith('\r') ? l.slice(0, -1) : l)
}

async function sizeOf(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size
  }
  catch {
    return 0
  }
}

export async function readCraftTweakerErrors(mcDir: string): Promise<{ lines: string[], count: number }> {
  return scanLogErrors(mcDir, ['crafttweaker.log'])
}

/**
 * Scan the given log files (relative to `mcDir`) for ERROR/FATAL lines. Missing
 * files are silently skipped, so a pack without e.g. CraftTweaker just yields
 * nothing — the scan list is mod-agnostic and warning-only.
 */
export async function scanLogErrors(mcDir: string, files: string[]): Promise<{ lines: string[], count: number }> {
  const lines: string[] = []
  for (const rel of files) {
    try {
      const content = await fs.readFile(join(mcDir, rel), 'utf-8')
      for (const line of content.split('\n')) {
        if (/\b(?:ERROR|FATAL)\b/.test(line)) {
          const t = line.trim()
          if (t) lines.push(t)
        }
      }
    }
    catch { /* file absent — skip */ }
  }
  return { lines, count: lines.length }
}

/** Read the last `bytes` of a file as UTF-8 (best-effort, '' on any error). */
async function tailText(filePath: string, bytes: number): Promise<string> {
  try {
    const size = (await fs.stat(filePath)).size
    const start = Math.max(0, size - bytes)
    const len = size - start
    if (len <= 0) return ''
    const buffer = Buffer.alloc(len)
    const fd = await fs.open(filePath, 'r')
    try {
      await fd.read(buffer, 0, len, start)
    }
    finally {
      await fd.close()
    }
    return buffer.toString('utf8')
  }
  catch {
    return ''
  }
}

/** Config-derived readiness signals a pack can declare (all optional). */
export interface ReadySignals {
  /** Pack "fully ready" line, e.g. a world-join message. */
  pattern?: RegExp
  /** Port that accepts connections once ready. */
  port?   : number
}

export interface ReadyVerdict {
  ready  : boolean
  /** How readiness was (or was not) decided. */
  reason : string
  /** Is a game process alive at all? A dead game never becomes ready. */
  running: boolean
}

/**
 * Judge whether the game is loaded & ready *right now*, from current state only
 * (no launch). Cascade, most-authoritative first; every mod-specific layer is
 * optional and skipped when unconfigured/unmet, falling back to the universal
 * "process alive + FML loaded" signal.
 */
export async function probeReadyNow(mcDir: string, signals: ReadySignals, launcher: Launcher): Promise<ReadyVerdict> {
  const pid = await launcher.getPid()
  if (!pid) return { ready: false, running: false, reason: 'game is not running' }
  if (signals.port && await tcpOpen(signals.port)) return { ready: true, running: true, reason: `port ${signals.port} is accepting connections` }
  const tail = await tailText(dbgLogPath(mcDir), 256 * 1024)
  if (signals.pattern && signals.pattern.test(tail)) return { ready: true, running: true, reason: 'ready line present in debug.log' }
  if (FML_LOADED.test(tail)) return { ready: true, running: true, reason: 'mods loaded (FML), at main menu' }
  // Alive but pre-FML. Say whether it is *moving*: a silent debug.log is the only
  // way to tell a wedged boot from a slow one, and both look "still loading".
  const quiet = await quietFor(dbgLogPath(mcDir))
  if (quiet < STALL_MS) return { ready: false, running: true, reason: 'still loading (no FML-loaded line yet)' }
  const last = lastLineOf(tail)
  const hint = stallHint(last)
  return {
    ready  : false,
    running: true,
    reason : `still loading, but debug.log has been silent for ${fmtDur(quiet)} — last line: ${last}${hint ? ` — ${hint}` : ''}`,
  }
}

export interface WaitOptions {
  /** Give up after this long with the game still loading. */
  timeoutMs: number
  /** Poll period (default 2s). */
  pollMs?  : number
  /** How long the process may stay invisible right after a launch (default 60s). */
  launchMs?: number
  /** Consecutive process-less polls before the game counts as dead (default 3). */
  strikes? : number
  /** Only crash reports newer than this belong to this boot (default: now). */
  since?   : number
  onPoll?  : (verdict: ReadyVerdict, elapsed: number) => void
}

export interface WaitVerdict extends ReadyVerdict {
  outcome     : 'ready' | 'dead' | 'timeout'
  /** Crash report / last FATAL block, when the game died. */
  diagnostics?: string
}

/**
 * Block until the game is ready — or until it is *provably never going to be*.
 * A dead game cannot become ready, so waiting out the timeout after the process
 * is gone only delays the report by minutes; `dead` is returned as soon as the
 * process has been missing for `strikes` polls (a few seconds of slack, because
 * a relauncher legitimately swaps the JVM mid-boot).
 */
export async function waitUntilReady(
  mcDir   : string,
  signals : ReadySignals,
  launcher: Launcher,
  opts    : WaitOptions
): Promise<WaitVerdict> {
  const pollMs = opts.pollMs ?? 2000
  const launchMs = opts.launchMs ?? DEFAULT_LAUNCH_MS / 2
  const strikes = opts.strikes ?? 3
  const start = Date.now()
  const since = opts.since ?? start
  let everRan = false
  let misses = 0

  for (;;) {
    const verdict = await probeReadyNow(mcDir, signals, launcher)
    const elapsed = Date.now() - start
    if (verdict.ready) return { ...verdict, outcome: 'ready' }
    if (verdict.running) {
      everRan = true
      misses = 0
    }
    else {
      misses++
    }
    opts.onPoll?.(verdict, elapsed)

    // Gone for good: it either died mid-boot or never started at all.
    if (misses >= strikes && (everRan || elapsed >= launchMs)) {
      return {
        ready  : false,
        running: false,
        outcome: 'dead',
        reason : everRan
          ? 'the game process died while loading'
          : `no game process appeared within ${Math.round(launchMs / 1000)}s of waiting`,
        diagnostics: await deathReport(mcDir, since) ?? undefined,
      }
    }
    if (elapsed >= opts.timeoutMs) return { ...verdict, outcome: 'timeout' }
    await sleep(pollMs)
  }
}

async function findNewestCrashReport(mcDir: string, afterTs: number): Promise<string | null> {
  const crashDir = join(mcDir, 'crash-reports')
  try {
    const entries = await fs.readdir(crashDir, { withFileTypes: true })
    const files = await Promise.all(
      entries
        .filter(e => e.isFile() && e.name.endsWith('.txt'))
        .map(async (e) => {
          const path = join(crashDir, e.name)
          const stat = await fs.stat(path)
          return { path, mtime: stat.mtimeMs }
        })
    )
    const recent = files.filter(f => f.mtime >= afterTs).sort((a, b) => b.mtime - a.mtime)
    return recent[0]?.path ?? null
  }
  catch {
    return null
  }
}

/**
 * Last FATAL entry of `debug.log` — the message line plus the throwable printed
 * under it. A launch can die *without* a crash report (the report builder itself
 * can throw, and pre-`Minecraft.init` failures never reach it), and then this is
 * the only trace of what happened.
 */
export async function lastFatal(mcDir: string, maxLines = 12): Promise<string | null> {
  const lines = (await tailText(dbgLogPath(mcDir), 256 * 1024)).split('\n')
  const at = lines.findLastIndex(l => /\/FATAL\]/.test(l))
  if (at < 0) return null
  const block = [lines[at].trim()]
  for (let i = at + 1; i < lines.length && block.length < maxLines; i++) {
    if (/^\[\d\d:\d\d:\d\d\]/.test(lines[i])) break // next log entry — throwable ended
    if (lines[i].trim()) block.push(lines[i].trimEnd())
  }
  return block.join('\n')
}

/**
 * Why the game died: its crash report if one was written after `afterTs`,
 * otherwise the last FATAL block. `null` when the log says nothing at all.
 */
export async function deathReport(mcDir: string, afterTs: number): Promise<string | null> {
  const crash = await findNewestCrashReport(mcDir, afterTs)
  if (crash) return `${crash}\n${await readCrashSummary(crash)}`
  return lastFatal(mcDir)
}

async function readCrashSummary(crashPath: string): Promise<string> {
  const content = await fs.readFile(crashPath, 'utf-8')
  const lines = content.split('\n')
  const title = lines.find(l => l.startsWith('// ')) ?? ''
  const desc = lines.find(l => l.startsWith('Description:')) ?? ''
  const causeStart = lines.findIndex(l => /^[\w.]+(?:Exception|Error)/.test(l))
  const cause = causeStart >= 0 ? lines.slice(causeStart, causeStart + 6).join('\n') : ''
  return [title, desc, cause].filter(Boolean).join('\n')
}

/** Accumulated, read-only view of the running session passed to {@link MonitorOptions.onTick}. */
export interface MonitorTick {
  /** Every debug.log line since launch. */
  debugLog       : string[]
  /** Every crafttweaker.log line since launch. */
  craftTweakerLog: string[]
  /** ms since launch. */
  elapsed        : number
  /** True once a crash report has appeared. */
  crashed        : boolean
}

export interface MonitorOptions {
  /** Called every tick (~1s). Return `'stop'` to end monitoring early. */
  onTick?      : (tick: MonitorTick) => 'stop' | void | Promise<'stop' | void>
  /**
   * Heartbeat (~every few s) so a long boot shows progress instead of silence.
   * `stalledMs` is how long `debug.log` has gone unwritten — without it a frozen
   * launch prints the same line as a healthy one, only with a bigger clock.
   */
  onProgress?  : (info: { elapsed: number, lastLine: string, stalledMs: number }) => void
  /** Layer 1: pack "fully ready" line — matching it ends monitoring immediately. */
  readyPattern?: RegExp
  /** Layer 2: pack port that starts accepting connections once ready. */
  readyPort?   : number
  /** Layer 3: universal fallback — "loaded" if the log is quiet this long after FML. */
  quietMs?     : number
  maxMs?       : number
  launchMs?    : number
  /** Diagnostic sink (stderr). */
  log?         : (msg: string) => void
}

const PROGRESS_MS = 5000

/**
 * Kill any running instance, launch a fresh one, and tail the logs until the
 * game goes idle / crashes / dies / times out — or until `onTick` returns
 * `'stop'`. Returns a structured outcome; never throws on a normal game crash.
 */
export async function restartAndMonitor(
  mcDir   : string,
  launcher: Launcher,
  opts    : MonitorOptions = {}
): Promise<MonitorResult> {
  const quietMs = opts.quietMs ?? envInt('REDUCER_MONITOR_QUIET_MS', DEFAULT_QUIET_MS)
  const maxMs = opts.maxMs ?? envInt('REDUCER_MONITOR_MAX_MS', DEFAULT_MAX_MS)
  const launchMs = opts.launchMs ?? DEFAULT_LAUNCH_MS
  const readyPattern = opts.readyPattern
  const readyPort = opts.readyPort
  const log = opts.log ?? (() => {})

  const dbg = dbgLogPath(mcDir)
  const ct = ctLogPath(mcDir)

  const initialDbg = await sizeOf(dbg)
  const initialCt = await sizeOf(ct)

  const existing = await launcher.getPid()
  if (existing) {
    await launcher.kill(existing)
    log(`killed existing ${launcher.name} PID ${existing}`)
  }
  await sleep(3000) // let the OS release file handles before relaunch

  await launcher.launch()
  const launchTs = Date.now()
  log(`launched via ${launcher.name}: ${await describeLauncher(launcher)}`)

  const debugTail = createTail(initialDbg)
  const ctTail = createTail(initialCt)
  const debugLog: string[] = []
  const craftTweakerLog: string[] = []

  let pid: number | null = null
  let lastChange = launchTs
  let lastHealth = launchTs
  let lastProgress = launchTs
  let lastPortProbe = 0
  let fmlAt = 0 // when FML finished loading mods (0 = not yet)
  let misses = 0 // consecutive health checks that found no process
  let crashed = false
  let crashSummary: string | undefined

  const resolvePid = async () => pid ?? await launcher.getPid() ?? undefined
  const lastLine = () => debugLog[debugLog.length - 1] ?? ''

  for (;;) {
    await sleep(TICK_MS)
    const now = Date.now()

    if (!pid) pid = await launcher.getPid()

    const newDebug = await readNewLines(dbg, debugTail)
    if (newDebug.length) {
      debugLog.push(...newDebug)
      lastChange = now
      const text = newDebug.join('\n')
      // Layer 1: pack-declared ready line is authoritative (e.g. a world-join),
      // and in-world log spam never goes "quiet" so the fallbacks can't fire.
      if (readyPattern && readyPattern.test(text)) return { outcome: 'idle', reached: 'pattern', pid: await resolvePid() }
      if (!fmlAt && FML_LOADED.test(text)) fmlAt = now
    }
    const newCt = await readNewLines(ct, ctTail)
    if (newCt.length) craftTweakerLog.push(...newCt)

    const crash = await findNewestCrashReport(mcDir, launchTs)
    if (crash && !crashed) {
      crashed = true
      crashSummary = await readCrashSummary(crash)
    }

    if (opts.onProgress && now - lastProgress >= PROGRESS_MS) {
      lastProgress = now
      opts.onProgress({ elapsed: now - launchTs, lastLine: lastLine(), stalledMs: now - lastChange })
    }

    if (opts.onTick) {
      const directive = await opts.onTick({ debugLog, craftTweakerLog, elapsed: now - launchTs, crashed })
      if (directive === 'stop') return { outcome: 'stopped', pid: pid ?? undefined, crashSummary }
    }

    if (crashed) return { outcome: 'crash', pid: pid ?? undefined, crashSummary }

    // Layer 2: a pack-declared port started accepting connections (mods finished first).
    if (readyPort && fmlAt && now - lastPortProbe >= PORT_PROBE_MS) {
      lastPortProbe = now
      if (await tcpOpen(readyPort)) return { outcome: 'idle', reached: 'port', pid: await resolvePid() }
    }

    // Layer 3 (universal): FML loaded and the log has been quiet since — main menu,
    // no world was auto-joined. Works for a bare Forge launch with zero mods.
    if (fmlAt && now - lastChange >= quietMs) {
      return { outcome: 'idle', reached: 'menu', pid: await resolvePid() }
    }

    if (now - lastHealth >= HEALTH_MS) {
      lastHealth = now
      // Two consecutive misses, because a relauncher legitimately swaps the JVM
      // mid-boot and the pid is briefly nobody's.
      if (pid && !await launcher.getPid()) misses++
      else misses = 0
      if (misses >= 2) {
        return { outcome: 'exit', pid: pid ?? undefined, lastLine: lastLine(), crashSummary: await lastFatal(mcDir) ?? undefined }
      }
    }

    if (!pid && now - launchTs >= launchMs) {
      return { outcome: 'exit', lastLine: lastLine() }
    }
    if (now - launchTs >= maxMs) {
      return { outcome: 'timeout', pid: pid ?? undefined, lastLine: lastLine() }
    }
  }
}
