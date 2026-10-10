import type { Mod } from '../Mod.js'
import { Buffer } from 'node:buffer'
import { open, readFile, stat, writeFile } from 'node:fs/promises'
import process from 'node:process'
import consola from 'consola'
import { join } from 'pathe'

/**
 * @file Scalar/Fugue "press any key" boot block.
 *
 * Cleanroom checks at startup (FMLClientHandler constructor, via
 * SplashProgress.confirm) whether the Fugue and Scalar coremods are present
 * and blocks the boot on a keypress when they are not — unless
 * `B:DISABLE_PATCH_MOD_CHECK=true` in `config/forge_early.cfg`. That prompt is
 * a loading-splash confirmation, not a GuiScreen: no mod (including the
 * e2ee-agent ScalarGuard) can dismiss it, because no mod code runs yet.
 *
 * So reducer flips the flag around the boot instead: on launch, when Fugue or
 * Scalar are disabled/absent, the flag goes to `true`; once the boot has
 * provably read it (any post-check FML log line — the check itself runs
 * before mod loading logs anything) it goes back to `false`. Only the absent
 * case ever touches the file, and the flip is always announced out loud so a
 * detached/background run still says what it did.
 */

const FLAG_KEY = 'B:DISABLE_PATCH_MOD_CHECK'

/** The two patch mods, matched against display name or jar basename. */
const PATCH_MODS = [/fugue/i, /scalar/i]

/** Log lines that can only appear after the handler constructor ran the check. */
const BOOT_READ_MARKERS = [
  /these mods are missing/i, // the check's own receipt (flag was false)
  /loading coremod/i,
  /searching .* for mods/i,
  /\bfound .* mods\b/i,
  /forge mod loader .* loaded/i,
  /fml .* initialized/i,
]

export interface PatchCheckOpts {
  dry?: boolean
}

function flagPath(gameDir: string): string {
  return join(gameDir, 'config/forge_early.cfg')
}

/** Patch mods among the roster that would fail the Cleanroom check. */
export function missingPatchMods(mods: Mod[]): Mod[] {
  return mods.filter(m => m.disabled && PATCH_MODS.some(re => re.test(m.displayName) || re.test(m.fileNameNoExt)))
}

/** True when the boot would hit the prompt: a patch mod disabled, or not installed at all. */
export function patchModsAbsent(mods: Mod[]): boolean {
  const rostered = mods.filter(m => PATCH_MODS.some(re => re.test(m.displayName) || re.test(m.fileNameNoExt)))
  if (rostered.length === 0) return true // neither mod installed
  return rostered.some(m => m.disabled)
}

/** Current flag value, or null when the file/key is missing or unreadable. */
export async function readPatchCheckFlag(gameDir: string): Promise<boolean | null> {
  let text: string
  try {
    text = await readFile(flagPath(gameDir), 'utf8')
  }
  catch {
    return null
  }
  const m = text.match(new RegExp(`^\\s*${FLAG_KEY}\\s*=\\s*(true|false)`, 'm'))
  return m ? m[1] === 'true' : null
}

/** Swap the flag value in place (line endings and comments untouched). */
export async function writePatchCheckFlag(gameDir: string, value: boolean): Promise<void> {
  const path = flagPath(gameDir)
  const text = await readFile(path, 'utf8')
  const next = text.replace(
    new RegExp(`(^\\s*${FLAG_KEY}\\s*=\\s*)(true|false)`, 'm'),
    `$1${value ? 'true' : 'false'}`
  )
  if (next === text) throw new Error(`${FLAG_KEY} not found in ${path}`)
  await writeFile(path, next, 'utf8')
}

export interface EnsureResult {
  /** True when this call flipped the flag and a restore is owed. */
  flipped: boolean
}

/**
 * Flip the flag to `true` for the coming boot when Fugue/Scalar are absent.
 * Announces the flip in reducer's own message (survives background/detached
 * runs because it is printed now, not at restore time). Never writes on dry.
 */
export async function ensurePatchCheckForBoot(gameDir: string, mods: Mod[], opts: PatchCheckOpts = {}): Promise<EnsureResult> {
  if (!patchModsAbsent(mods)) return { flipped: false }
  const missing = missingPatchMods(mods).map(m => m.displayName)
  const why = missing.length ? missing.join(', ') : 'Fugue/Scalar not installed'
  const current = await readPatchCheckFlag(gameDir)
  if (current === true) {
    consola.info(`patch-mod check already off (${why}) — leaving ${FLAG_KEY}=true.`)
    return { flipped: false }
  }
  if (opts.dry) {
    consola.info(`would flip ${FLAG_KEY} to true for this boot (${why}) (assumed).`)
    return { flipped: false }
  }
  try {
    await writePatchCheckFlag(gameDir, true)
  }
  catch (e) {
    consola.warn(`wanted to flip ${FLAG_KEY} for this boot (${why}), but ${(e as Error).message}`)
    return { flipped: false }
  }
  consola.warn(`${why} — flipped ${FLAG_KEY} to true for this boot; restoring to false once the boot has read it.`)
  return { flipped: true }
}

/** Restore the flag to `false` after the boot has read it. Only call when flipped. */
export async function restorePatchCheckFlag(gameDir: string, opts: PatchCheckOpts = {}): Promise<void> {
  if (opts.dry) {
    consola.info(`would restore ${FLAG_KEY} to false (assumed).`)
    return
  }
  try {
    await writePatchCheckFlag(gameDir, false)
    consola.info(`restored ${FLAG_KEY} to false.`)
  }
  catch (e) {
    consola.warn(`could not restore ${FLAG_KEY} to false: ${(e as Error).message}`)
  }
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  }
  catch {
    return 0
  }
}

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface WaitOpts {
  /** Give up after this long (default 5 min); the caller still restores. */
  timeoutMs?: number
  pollMs?   : number
}

/**
 * Wait until the running boot has provably passed the patch-mod check: any
 * marker line appears in debug.log past the launch point. True on proof,
 * false on timeout (the game never launched or logs elsewhere).
 */
export async function waitUntilBootReadFlag(gameDir: string, opts: WaitOpts = {}): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 300_000
  const pollMs = opts.pollMs ?? 2000
  const dbg = join(gameDir, 'logs/debug.log')
  const startSize = await sizeOf(dbg)
  const start = Date.now()
  let pos = startSize
  const decoder = new TextDecoder()
  for (;;) {
    const size = await sizeOf(dbg)
    if (size > pos) {
      const fd = await open(dbg, 'r')
      try {
        const len = size - pos
        const buf = Buffer.alloc(len)
        await fd.read(buf, 0, len, pos)
        pos = size
        const text = decoder.decode(buf)
        if (BOOT_READ_MARKERS.some(re => re.test(text))) return true
      }
      finally {
        await fd.close()
      }
    }
    else if (size < pos) {
      pos = 0 // log rotated/truncated by the new boot
    }
    if (Date.now() - start >= timeoutMs) return false
    await sleep(pollMs)
  }
}

/** Workdir-independent entry for `process.env` overrides in tests. */
export function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}
