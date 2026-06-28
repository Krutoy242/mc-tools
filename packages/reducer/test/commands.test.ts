import { resolve } from 'pathe'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAction, runFind, runKill, runRestart } from '../src/core/commands.js'
import { loadRuntime } from '../src/core/runtime.js'
import { clearSession, snapshotMods, writeSession  } from '../src/session/lock.js'

const PACK = resolve(__dirname, 'fixtures/pack')

beforeEach(() => clearSession(PACK))

describe('failure handling', () => {
  it('find returns 0 for a unique match', async () => {
    expect(await runFind({ mcPath: PACK, queries: ['Alpha'], dependencies: false, dependents: false })).toBe(0)
  })

  it('find returns 1 for an ambiguous query', async () => {
    expect(await runFind({ mcPath: PACK, queries: ['Twin'], dependencies: false, dependents: false })).toBe(1)
  })

  it('action returns 1 when a mod is not found', async () => {
    expect(await runAction({ mcPath: PACK, kind: 'disable', queries: ['zzz-nope'], dry: true })).toBe(1)
  })

  it('restart rejects a self-excluding --disable + --enable', async () => {
    const code = await runRestart({
      mcPath : PACK,
      dry    : true,
      full   : false,
      disable: ['Core Lib'],
      enable : ['Alpha'],
      only   : [],
      except : [],
    })
    expect(code).toBe(1)
  })

  it('refuses to act when a previous session was interrupted', async () => {
    const { mods } = await loadRuntime(PACK)
    writeSession(PACK, { phase: 'bisecting', snapshot: snapshotMods(mods) })
    const code = await runAction({ mcPath: PACK, kind: 'enable', queries: ['Alpha'], dry: true })
    expect(code).toBe(1)
    clearSession(PACK)
  })

  it('kill reports gracefully when Minecraft is not running', async () => {
    expect(await runKill(PACK, false)).toBe(0)
  })
})

describe('dry actions', () => {
  it('a dry action succeeds without touching files', async () => {
    const code = await runAction({ mcPath: PACK, kind: 'only', queries: ['Alpha'], dry: true, advise: true })
    expect(code).toBe(0)
    const { mods } = await loadRuntime(PACK)
    // Nothing was actually disabled on disk.
    expect(mods.every(m => m.enabled)).toBe(true)
  })
})
