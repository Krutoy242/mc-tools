import type { Launcher } from '../src/launcher/types.js'
import type { Mod } from '../src/Mod.js'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { runAutoBinary } from '../src/binary/auto.js'
import { loadConditions } from '../src/binary/conditions.js'
import { buildFullLogContext, checkPerformance, checkReachability, validateConditions } from '../src/binary/validate.js'
import { loadRuntime } from '../src/core/runtime.js'

const PACK = resolve(__dirname, 'fixtures/pack')
const COND = resolve(__dirname, 'fixtures/conditions')

const nullLauncher: Launcher = {
  name  : 'null',
  getPid: async () => null,
  launch: async () => {},
  kill  : async () => {},
}

async function mods(): Promise<Mod[]> {
  return (await loadRuntime(PACK)).mods
}

describe('loadConditions', () => {
  it('loads a valid conditions file', async () => {
    const c = await loadConditions(resolve(COND, 'valid.ts'))
    expect(typeof c.isTestEnded).toBe('function')
    expect(typeof c.isBugFound).toBe('function')
    expect(c.isBugFound({ debugText: 'Enqueued coremod CrashAssistantEntrypoint', debugLog: [], craftTweakerLog: [], elapsed: 0, crashed: false })).toBe(true)
  })

  it('rejects a config missing a required field', async () => {
    await expect(loadConditions(resolve(COND, 'missing-bug.ts'))).rejects.toThrow(/isBugFound/)
  })
})

describe('validation', () => {
  it('passes reachability + perf on the fixture log', async () => {
    const c = await loadConditions(resolve(COND, 'valid.ts'))
    const result = await validateConditions(c, PACK)
    expect(result.ok).toBe(true)
  })

  it('fails reachability when nothing matches the current log', async () => {
    const c = await loadConditions(resolve(COND, 'unreachable.ts'))
    const ctx = await buildFullLogContext(PACK)
    const r = checkReachability(c, ctx)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/unreachable|never matched/i)
  })

  it('fails the perf guard for a slow function (2s+ equivalent)', async () => {
    const slow = {
      isTestEnded: () => true,
      isBugFound : () => {
        const end = performance.now() + 8
        while (performance.now() < end) { /* busy ~8ms */ }
        return true
      },
    }
    const ctx = await buildFullLogContext(PACK)
    // Tiny budget makes the 8ms function trip the guard quickly.
    const r = checkPerformance(slow, ctx, { budgetMs: 2, samples: 3 })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/backtracking|averages/)
  })
})

describe('runAutoBinary (dry)', () => {
  it('converges to a single culprit when the bug is present', async () => {
    const conditions = { isTestEnded: () => true, isBugFound: () => true }
    const res = await runAutoBinary({
      mcDir   : PACK,
      mods    : await mods(),
      conditions,
      launcher: nullLauncher,
      dry     : true,
      log     : () => {},
    })
    expect(res.outcome).toBe('culprit')
    expect(res.culprit).toBeDefined()
    expect(res.iterations.length).toBeGreaterThan(0)
  })

  it('still narrows to a culprit when the bug is absent', async () => {
    const conditions = { isTestEnded: () => true, isBugFound: () => false }
    const res = await runAutoBinary({
      mcDir   : PACK,
      mods    : await mods(),
      conditions,
      launcher: nullLauncher,
      dry     : true,
      log     : () => {},
    })
    expect(res.outcome).toBe('culprit')
    expect(res.culprit).toBeDefined()
  })
})
