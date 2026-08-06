import type { Launcher } from '../src/launcher/types.js'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { describe, expect, it } from 'vitest'
import { lastFatal, probeReadyNow, scanLogErrors, waitUntilReady } from '../src/launcher/monitor.js'

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

/** Launcher whose pid follows a scripted sequence, one step per `getPid` call. */
function scriptedLauncher(pids: (number | null)[]): Launcher {
  let i = 0
  return {
    name  : 'scripted',
    getPid: async () => pids[Math.min(i++, pids.length - 1)],
    launch: async () => {},
    kill  : async () => {},
  }
}

const FATAL_LOG = `[19:20:16] [Client thread/INFO] [FML]: still loading
[19:20:17] [Client thread/FATAL] [Foundation]: Unable to launch
java.lang.NoSuchMethodError: 'void net.minecraftforge.fml.common.FMLCommonHandler.enhanceCrashReport()'
\tat net.minecraft.crash.CrashReport.populateEnvironment(CrashReport.java:119)
`

describe('lastFatal', () => {
  it('returns the FATAL line with its throwable', async () => {
    const dir = mkMc({ 'logs/debug.log': FATAL_LOG })
    const block = await lastFatal(dir)
    expect(block).toContain('Unable to launch')
    expect(block).toContain('NoSuchMethodError')
    expect(block).toContain('populateEnvironment')
    expect(block).not.toContain('still loading')
  })
  it('is null when nothing fatal was logged', async () => {
    expect(await lastFatal(mkMc({ 'logs/debug.log': 'all good\n' }))).toBeNull()
  })
})

describe('waitUntilReady fails fast instead of waiting out the timeout', () => {
  const opts = { timeoutMs: 60_000, pollMs: 1, strikes: 2, launchMs: 5 }

  it('reports a mid-boot death as soon as the process is gone', async () => {
    const dir = mkMc({ 'logs/debug.log': FATAL_LOG })
    const started = Date.now()
    const v = await waitUntilReady(dir, {}, scriptedLauncher([1, 1, null]), opts)
    expect(v.outcome).toBe('dead')
    expect(v.reason).toMatch(/died while loading/)
    expect(v.diagnostics).toContain('Unable to launch')
    expect(Date.now() - started).toBeLessThan(opts.timeoutMs)
  })

  it('tolerates a single missing poll (a relauncher swapping the JVM)', async () => {
    const dir = mkMc({ 'logs/debug.log': 'booting…\n' })
    const launcher = scriptedLauncher([1, null, 1, 1])
    const v = await waitUntilReady(dir, {}, launcher, { ...opts, timeoutMs: 20 })
    expect(v.outcome).toBe('timeout')
  })

  it('reports a launch that never produced a process', async () => {
    const v = await waitUntilReady(mkMc({}), {}, fakeLauncher(null), opts)
    expect(v.outcome).toBe('dead')
    expect(v.reason).toMatch(/no game process appeared/)
  })

  it('still returns ready when the game loads', async () => {
    const dir = mkMc({ 'logs/debug.log': '[FML]: Forge Mod Loader has successfully loaded 4 mods\n' })
    const v = await waitUntilReady(dir, {}, fakeLauncher(1), opts)
    expect(v.outcome).toBe('ready')
  })
})
