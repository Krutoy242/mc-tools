import { describe, expect, it } from 'vitest'
import { buildTheme, hashName } from '../src/theme.js'

describe('theme', () => {
  it('hashName is deterministic and 32-bit', () => {
    const a = hashName('Engimatica E2E')
    const b = hashName('Engimatica E2E')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(2 ** 32)
  })

  it('hashName diverges for similar inputs', () => {
    expect(hashName('foo')).not.toBe(hashName('Foo'))
    expect(hashName('a')).not.toBe(hashName('b'))
  })

  it('buildTheme is deterministic per name', () => {
    const a = buildTheme('Project Ozone 3')
    const b = buildTheme('Project Ozone 3')
    expect(a).toEqual(b)
  })

  it('buildTheme palette is well-formed', () => {
    const t = buildTheme('Test Pack')
    // Hex colors.
    for (const k of ['primary', 'splitA', 'splitB', 'accent', 'success', 'warning', 'danger', 'panel', 'fg'] as const) {
      expect(t[k]).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(t.bundleTints).toHaveLength(8)
    for (const c of t.bundleTints) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(t.primaryHue).toBeGreaterThanOrEqual(0)
    expect(t.primaryHue).toBeLessThan(360)
  })
})
