import type { Launcher } from '../launcher/types.js'

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** How long a kill may take to show up as "no process" before we stop waiting. */
const STOP_TIMEOUT_MS = 30_000
/** Breathing room for the OS to release jar handles after the process is gone. */
const HANDLE_RELEASE_MS = 3000

export interface StopOpts {
  dry?      : boolean
  timeoutMs?: number
}

/**
 * Stop the running game BEFORE any jar rename. Renaming while the game holds
 * its jars fails on Windows (file locks) and poisons the session with an
 * "interrupted" record — so every mutating verb waits out the exit here
 * instead of discovering locked files mid-plan. No-op when nothing runs;
 * never kills on dry (logs the assumed stop instead).
 */
export async function ensureGameStopped(launcher: Launcher, log: (msg: string) => void, opts: StopOpts = {}): Promise<void> {
  const pid = await launcher.getPid()
  if (!pid) return
  if (opts.dry) {
    log(`would stop ${launcher.name} PID ${pid} before renaming mods (assumed).`)
    return
  }
  await launcher.kill(pid)
  log(`killed existing ${launcher.name} PID ${pid}`)
  const timeoutMs = opts.timeoutMs ?? STOP_TIMEOUT_MS
  const start = Date.now()
  for (;;) {
    if (!await launcher.getPid()) break
    if (Date.now() - start >= timeoutMs) {
      log(`warning: ${launcher.name} PID ${pid} is still alive after ${Math.round(timeoutMs / 1000)}s — renames may fail on locked files.`)
      return
    }
    await sleep(500)
  }
  await sleep(HANDLE_RELEASE_MS) // let the OS release file handles before renaming
}
