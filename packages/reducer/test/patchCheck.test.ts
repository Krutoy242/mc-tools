import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ensurePatchCheckForBoot,
  patchModsAbsent,
  readPatchCheckFlag,
  restorePatchCheckFlag,
  waitUntilBootReadFlag,
  writePatchCheckFlag,
} from '../src/core/patchCheck.js'
import { Mod } from '../src/Mod.js'

function CFG(v: string, eol = '\n'): string {
  return `# Configuration file${eol}${eol}general {${eol}    B:DISABLE_PATCH_MOD_CHECK=${v}${eol}}${eol}`
}

function gameDirWith(flag: string, eol = '\n'): string {
  const dir = mkdtempSync(join(tmpdir(), 'patchcheck-'))
  mkdirSync(join(dir, 'config'), { recursive: true })
  writeFileSync(join(dir, 'config/forge_early.cfg'), CFG(flag, eol))
  return dir
}

const fugue = (file: string) => new Mod(file, undefined)

describe('patchModsAbsent', () => {
  it('is true when neither mod is installed', () => {
    expect(patchModsAbsent([fugue('jei.jar'), fugue('crafttweaker.jar')])).toBe(true)
  })

  it('is false when both are enabled', () => {
    expect(patchModsAbsent([fugue('+Fugue-0.24.4.jar'), fugue('Scalar Legacy-1.0.1.jar')])).toBe(false)
  })

  it('is true when one of them is disabled', () => {
    expect(patchModsAbsent([fugue('+Fugue-0.24.4.jar'), fugue('Scalar Legacy-1.0.1.jar.disabled')])).toBe(true)
  })
})

describe('flag read/write', () => {
  it('round-trips the value and preserves CRLF', async () => {
    const dir = gameDirWith('false', '\r\n')
    expect(await readPatchCheckFlag(dir)).toBe(false)
    await writePatchCheckFlag(dir, true)
    expect(await readPatchCheckFlag(dir)).toBe(true)
    expect(readFileSync(join(dir, 'config/forge_early.cfg'), 'utf8')).toContain('\r\n')
  })

  it('returns null when the file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'patchcheck-'))
    expect(await readPatchCheckFlag(dir)).toBe(null)
  })
})

describe('ensure + restore', () => {
  it('flips false→true only when the patch mods are absent', async () => {
    const dir = gameDirWith('false')
    const r = await ensurePatchCheckForBoot(dir, [fugue('jei.jar')])
    expect(r).toEqual({ flipped: true })
    expect(await readPatchCheckFlag(dir)).toBe(true)
    await restorePatchCheckFlag(dir)
    expect(await readPatchCheckFlag(dir)).toBe(false)
  })

  it('leaves the flag alone when both patch mods are enabled', async () => {
    const dir = gameDirWith('false')
    const r = await ensurePatchCheckForBoot(dir, [fugue('+Fugue-0.24.4.jar'), fugue('Scalar Legacy-1.0.1.jar')])
    expect(r).toEqual({ flipped: false })
    expect(await readPatchCheckFlag(dir)).toBe(false)
  })

  it('does not write on dry runs', async () => {
    const dir = gameDirWith('false')
    const r = await ensurePatchCheckForBoot(dir, [fugue('jei.jar')], { dry: true })
    expect(r).toEqual({ flipped: false })
    expect(await readPatchCheckFlag(dir)).toBe(false)
  })
})

describe('waitUntilBootReadFlag', () => {
  it('resolves true once a post-check line lands in debug.log', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'patchcheck-'))
    mkdirSync(join(dir, 'logs'), { recursive: true })
    writeFileSync(join(dir, 'logs/debug.log'), '[12:00:00] [main/INFO]: Launching\n')
    const seen = waitUntilBootReadFlag(dir, { timeoutMs: 10_000, pollMs: 50 })
    await new Promise(r => setTimeout(r, 200))
    writeFileSync(join(dir, 'logs/debug.log'), '[12:00:00] [main/INFO]: Launching\n[12:00:01] [main/INFO]: Loading coremod fugue\n')
    expect(await seen).toBe(true)
  })

  it('resolves false on timeout instead of hanging', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'patchcheck-'))
    expect(await waitUntilBootReadFlag(dir, { timeoutMs: 150, pollMs: 50 })).toBe(false)
  })
})
