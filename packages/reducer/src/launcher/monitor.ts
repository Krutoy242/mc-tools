import type { Launcher, MonitorResult } from './types.js'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import { join } from 'pathe'

const TICK_MS = 1000
const HEALTH_MS = 3000
const DEFAULT_STALL_MS = 30_000
const DEFAULT_MAX_MS = 300_000
const DEFAULT_LAUNCH_MS = 120_000

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  try {
    const content = await fs.readFile(ctLogPath(mcDir), 'utf-8')
    const lines = content
      .split('\n')
      .filter(line => /\b(?:ERROR|FATAL)\b/.test(line))
      .map(line => line.trim())
      .filter(Boolean)
    return { lines, count: lines.length }
  }
  catch {
    return { lines: [], count: 0 }
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
  onTick?  : (tick: MonitorTick) => 'stop' | void | Promise<'stop' | void>
  stallMs? : number
  maxMs?   : number
  launchMs?: number
  /** Diagnostic sink (stderr). */
  log?     : (msg: string) => void
}

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
  const stallMs = opts.stallMs ?? DEFAULT_STALL_MS
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS
  const launchMs = opts.launchMs ?? DEFAULT_LAUNCH_MS
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
  log(`launched via ${launcher.name}`)

  const debugTail = createTail(initialDbg)
  const ctTail = createTail(initialCt)
  const debugLog: string[] = []
  const craftTweakerLog: string[] = []

  let pid: number | null = null
  let lastChange = launchTs
  let lastHealth = launchTs
  let crashed = false
  let crashSummary: string | undefined

  for (;;) {
    await sleep(TICK_MS)
    const now = Date.now()

    if (!pid) pid = await launcher.getPid()

    const newDebug = await readNewLines(dbg, debugTail)
    if (newDebug.length) {
      debugLog.push(...newDebug)
      lastChange = now
    }
    const newCt = await readNewLines(ct, ctTail)
    if (newCt.length) craftTweakerLog.push(...newCt)

    const crash = await findNewestCrashReport(mcDir, launchTs)
    if (crash && !crashed) {
      crashed = true
      crashSummary = await readCrashSummary(crash)
    }

    if (opts.onTick) {
      const directive = await opts.onTick({ debugLog, craftTweakerLog, elapsed: now - launchTs, crashed })
      if (directive === 'stop') return { outcome: 'stopped', pid: pid ?? undefined, crashSummary }
    }

    if (crashed) return { outcome: 'crash', pid: pid ?? undefined, crashSummary }

    if (now - lastHealth >= HEALTH_MS) {
      lastHealth = now
      if (pid && !await launcher.getPid()) {
        return { outcome: 'exit', pid }
      }
      if (now - lastChange >= stallMs && pid) {
        return { outcome: 'idle', pid }
      }
    }

    if (!pid && now - launchTs >= launchMs) {
      return { outcome: 'exit' }
    }
    if (now - launchTs >= maxMs) {
      return { outcome: 'timeout', pid: pid ?? undefined }
    }
  }
}
