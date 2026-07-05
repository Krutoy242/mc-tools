import type { Launcher } from '../src/launcher/types.js'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { describe, expect, it } from 'vitest'
import { probeReadyNow, scanLogErrors } from '../src/launcher/monitor.js'

function mkMc(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'reducer-mon-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return dir
}

function fakeLauncher(pid: number | null): Launcher {
  return {
    name  : 'fake',
    getPid: async () => pid,
    launch: async () => {},
    kill  : async () => {},
  }
}

describe('scanLogErrors (mod-agnostic, skips missing)', () => {
  it('collects ERROR/FATAL and skips absent files', async () => {
    const dir = mkMc({ 'crafttweaker.log': 'ok\n[ERROR] boom\n[FATAL] bad\ninfo\n' })
    const r = await scanLogErrors(dir, ['crafttweaker.log', 'not-here.log'])
    expect(r.count).toBe(2)
  })
  it('is empty when the configured log is absent (e.g. no CraftTweaker)', async () => {
    expect((await scanLogErrors(mkMc({}), ['crafttweaker.log'])).count).toBe(0)
  })
})

describe('probeReadyNow readiness cascade', () => {
  it('not running → not ready', async () => {
    const v = await probeReadyNow(mkMc({}), {}, fakeLauncher(null))
    expect(v.ready).toBe(false)
  })
  it('running + universal FML-loaded → ready with zero mods (no ProbeZS/CT)', async () => {
    const dir = mkMc({ 'logs/debug.log': '[FML]: Forge Mod Loader has successfully loaded 4 mods\n' })
    expect((await probeReadyNow(dir, {}, fakeLauncher(1))).ready).toBe(true)
  })
  it('running but pre-FML → not ready (still booting)', async () => {
    const dir = mkMc({ 'logs/debug.log': 'booting...\n' })
    expect((await probeReadyNow(dir, {}, fakeLauncher(1))).ready).toBe(false)
  })
  it('pack-declared ready line wins even before quiet', async () => {
    const dir = mkMc({ 'logs/debug.log': 'Player joined the game\n' })
    const v = await probeReadyNow(dir, { pattern: /joined the game/i }, fakeLauncher(1))
    expect(v.ready).toBe(true)
  })
})
