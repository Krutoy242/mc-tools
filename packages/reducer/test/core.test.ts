import type { Mod } from '../src/Mod.js'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { dependencyClosure, dependentsClosure } from '../src/core/graph.js'
import { applyPlan, computeAction, computeCombined, isConflict } from '../src/core/modActions.js'
import { resolveMod, resolveMods } from '../src/core/resolve.js'
import { loadRuntime } from '../src/core/runtime.js'

const PACK = resolve(__dirname, 'fixtures/pack')

async function mods(): Promise<Mod[]> {
  return (await loadRuntime(PACK)).mods
}

function byName(list: Mod[], name: string): Mod {
  const m = list.find(x => x.displayName === name)
  if (!m) throw new Error(`fixture mod not found: ${name}`)
  return m
}

describe('fixture graph', () => {
  it('wires a shared dependency (4 mods → Core Lib)', async () => {
    const list = await mods()
    const core = byName(list, 'Core Lib')
    expect(core.dependents.size).toBe(4)
    for (const n of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      expect(byName(list, n).dependencies).toContain(core)
    }
  })

  it('wires the 3- and 4-mod chains', async () => {
    const list = await mods()
    const c3c = byName(list, 'Chain3 C')
    expect([...dependencyClosure([c3c])].map(m => m.displayName).sort())
      .toEqual(['Chain3 A', 'Chain3 B', 'Chain3 C'])
    const c4d = byName(list, 'Chain4 D')
    expect(dependencyClosure([c4d]).size).toBe(4)
  })
})

describe('resolveMod', () => {
  it('matches by id, name and filename', async () => {
    const list = await mods()
    expect(resolveMod(list, '100')).toMatchObject({ kind: 'ok' })
    expect((resolveMod(list, '100') as { mod: Mod }).mod.displayName).toBe('Core Lib')
    expect((resolveMod(list, 'Alpha') as { mod: Mod }).mod.displayName).toBe('Alpha')
    expect((resolveMod(list, 'gamma') as { mod: Mod }).mod.displayName).toBe('Gamma')
  })

  it('reports not found', async () => {
    expect(resolveMod(await mods(), 'zzz-nope').kind).toBe('notfound')
  })

  it('reports ambiguity for duplicate names', async () => {
    const r = resolveMod(await mods(), 'Twin')
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.candidates.length).toBe(2)
  })

  it('resolveMods collects hits and failures', async () => {
    const r = resolveMods(await mods(), ['Alpha', 'zzz-nope'])
    expect(r.mods.map(m => m.displayName)).toEqual(['Alpha'])
    expect(r.failures).toHaveLength(1)
  })
})

describe('computeAction', () => {
  it('disable closes over dependents', async () => {
    const list = await mods()
    const plan = computeAction(list, 'disable', [byName(list, 'Core Lib')])
    const names = plan.toDisable.map(m => m.displayName).sort()
    expect(names).toEqual(['Alpha', 'Beta', 'Core Lib', 'Delta', 'Gamma'])
    expect(plan.toEnable).toHaveLength(0)
  })

  it('only keeps the target + deps, disables the rest', async () => {
    const list = await mods()
    const plan = computeAction(list, 'only', [byName(list, 'Alpha')])
    const disabled = new Set(plan.toDisable.map(m => m.displayName))
    expect(disabled.has('Beta')).toBe(true)
    expect(disabled.has('Alpha')).toBe(false)
    expect(disabled.has('Core Lib')).toBe(false) // dependency of Alpha is kept
  })

  it('except disables the target + dependents, enables the rest', async () => {
    const list = await mods()
    const plan = computeAction(list, 'except', [byName(list, 'Core Lib')])
    expect(plan.toDisable.map(m => m.displayName).sort())
      .toEqual(['Alpha', 'Beta', 'Core Lib', 'Delta', 'Gamma'])
  })

  it('full enables every disabled mod', async () => {
    const list = await mods()
    const plan = computeAction(list, 'full', [])
    expect(plan.toDisable).toHaveLength(0)
  })
})

describe('computeCombined', () => {
  it('flags a self-excluding disable+enable', async () => {
    const list = await mods()
    const combined = computeCombined([byName(list, 'Core Lib')], [byName(list, 'Alpha')])
    expect(isConflict(combined)).toBe(true)
  })

  it('allows an independent disable+enable', async () => {
    const list = await mods()
    const combined = computeCombined([byName(list, 'Chain3 C')], [byName(list, 'Chain4 A')])
    expect(isConflict(combined)).toBe(false)
  })
})

describe('applyPlan (dry)', () => {
  it('reports counts without touching files', async () => {
    const list = await mods()
    const plan = computeAction(list, 'only', [byName(list, 'Alpha')])
    const before = list.filter(m => m.enabled).length
    const res = await applyPlan(plan, true)
    expect(res.disabled).toBe(plan.toDisable.length)
    expect(res.failed).toHaveLength(0)
    // Dry run must not change any on-disk state.
    expect(list.filter(m => m.enabled).length).toBe(before)
  })

  it('dependentsClosure of a leaf is just itself', async () => {
    const list = await mods()
    expect(dependentsClosure([byName(list, 'Delta')]).size).toBe(1)
  })
})
