import type { StatusMap } from '../src/binarySearch.js'
import { describe, expect, it } from 'vitest'
import {
  classifyAfterAnswer,
  computeBundles,
  countByStatus,
  getStatus,
  nextPartition,
  requiredClosure,
} from '../src/binarySearch.js'
import { Mod } from '../src/Mod.js'

function makeMod(name: string): Mod {
  // Create an enabled .jar mod with no addon. The constructor sets isDisabled
  // based on file extension, so .jar => enabled.
  return new Mod(`${name}.jar`, undefined)
}

function link(parent: Mod, child: Mod) {
  // child requires parent
  child.dependencies.push(parent)
  parent.dependents.add(child)
}

describe('binarySearch', () => {
  describe('requiredClosure', () => {
    it('includes the mod itself', () => {
      const a = makeMod('A')
      const closure = requiredClosure(a, new Set([a]))
      expect([...closure]).toEqual([a])
    })

    it('walks up dependency chains, not down', () => {
      const lib  = makeMod('lib')
      const mid  = makeMod('mid')
      const leaf = makeMod('leaf')
      link(lib, mid)
      link(mid, leaf)
      const all = new Set([lib, mid, leaf])
      expect([...requiredClosure(leaf, all)].sort((x, y) => x.fileName.localeCompare(y.fileName)))
        .toEqual([leaf, lib, mid].sort((x, y) => x.fileName.localeCompare(y.fileName)))
      // From the library's perspective there is no upward dep.
      expect([...requiredClosure(lib, all)]).toEqual([lib])
    })

    it('respects suspect-set boundary', () => {
      const lib  = makeMod('lib')
      const leaf = makeMod('leaf')
      link(lib, leaf)
      const closure = requiredClosure(leaf, new Set([leaf]))
      expect([...closure]).toEqual([leaf]) // lib not in suspects so excluded
    })
  })

  describe('computeBundles', () => {
    it('groups mods connected via dep edges (undirected)', () => {
      const a = makeMod('A')
      const b = makeMod('B')
      const c = makeMod('C') // standalone
      link(a, b)
      const bundles = computeBundles([a, b, c])
      expect(bundles).toHaveLength(2)
      expect(bundles[0].members).toEqual(expect.arrayContaining([a, b]))
      expect(bundles[1].members).toEqual([c])
    })

    it('treats a shared library as a single bundle with all dependents', () => {
      const lib = makeMod('lib')
      const x = makeMod('X')
      const y = makeMod('Y')
      link(lib, x)
      link(lib, y)
      const bundles = computeBundles([lib, x, y])
      expect(bundles).toHaveLength(1)
      expect(bundles[0].members).toEqual(expect.arrayContaining([lib, x, y]))
    })
  })

  describe('nextPartition', () => {
    it('produces a downward-closed enabled set', () => {
      const lib = makeMod('lib')
      const a = makeMod('A')
      const b = makeMod('B')
      const c = makeMod('C')
      const d = makeMod('D')
      link(lib, a)
      link(lib, b)
      // c, d are independent suspects
      const status: StatusMap = new Map()
      const plan = nextPartition([lib, a, b, c, d], status)
      // If A is enabled, lib must be too.
      if (plan.enabledSuspects.has(a)) expect(plan.enabledSuspects.has(lib)).toBe(true)
      if (plan.enabledSuspects.has(b)) expect(plan.enabledSuspects.has(lib)).toBe(true)
      // Halves should sum to total suspects.
      expect(plan.enabledSuspects.size + plan.disabledSuspects.size).toBe(5)
    })

    it('keeps trusted disabled and ignored enabled regardless of suspect halving', () => {
      const t = makeMod('T')
      const i = makeMod('I')
      const s = makeMod('S')
      const status: StatusMap = new Map()
      status.set(t, 'trusted')
      status.set(i, 'ignored')
      const plan = nextPartition([t, i, s], status)
      expect(plan.disable.has(t)).toBe(true)
      expect(plan.enable.has(i)).toBe(true)
    })

    it('produces a non-empty disabled half when suspects form one closure chain', () => {
      // Construct a 10-mod chain where each mod requires the previous one.
      // Without the leaf-fallback this would yield enable=10/disable=0 and the
      // search would never make progress.
      const chain: Mod[] = []
      for (let i = 0; i < 10; i++) chain.push(makeMod(`m${i}`))
      for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i])
      const plan = nextPartition(chain, new Map())
      expect(plan.disabledSuspects.size).toBeGreaterThan(0)
      expect(plan.enabledSuspects.size).toBeGreaterThan(0)
      expect(plan.enabledSuspects.size + plan.disabledSuspects.size).toBe(chain.length)
      // The disabled half must remain downward-closed: any mod that depends on
      // a disabled suspect must also be disabled.
      for (const m of plan.enabledSuspects) {
        for (const dep of m.dependencies) {
          if (chain.includes(dep)) expect(plan.enabledSuspects.has(dep)).toBe(true)
        }
      }
    })
  })

  describe('classifyAfterAnswer', () => {
    it('exonerates the disabled half when bug persists', () => {
      const a = makeMod('A')
      const b = makeMod('B')
      const status: StatusMap = new Map()
      const plan = nextPartition([a, b], status)
      const next = classifyAfterAnswer(status, plan, true)
      for (const m of plan.disabledSuspects) {
        expect(next.get(m)).toBe('trusted')
      }
      for (const m of plan.enabledSuspects) {
        expect(next.get(m) ?? 'suspect').toBe('suspect')
      }
    })

    it('exonerates the enabled half when bug is gone', () => {
      const a = makeMod('A')
      const b = makeMod('B')
      const status: StatusMap = new Map()
      const plan = nextPartition([a, b], status)
      const next = classifyAfterAnswer(status, plan, false)
      for (const m of plan.enabledSuspects) {
        expect(next.get(m)).toBe('trusted')
      }
    })
  })

  describe('countByStatus', () => {
    it('defaults unknown mods to suspect', () => {
      const a = makeMod('A')
      const b = makeMod('B')
      const status: StatusMap = new Map()
      status.set(a, 'trusted')
      const counts = countByStatus([a, b], status)
      expect(counts).toEqual({ trusted: 1, suspect: 1, ignored: 0, total: 2 })
    })
  })

  describe('getStatus', () => {
    it('returns suspect when no entry exists', () => {
      expect(getStatus(new Map(), makeMod('X'))).toBe('suspect')
    })
  })
})
