import { describe, expect, it } from 'vitest'

import { naturalSort } from '../src/natural-sort.js'

describe('naturalSort', () => {
  it('orders embedded numbers numerically, not lexically', () => {
    const input = ['mod-v10', 'mod-v2', 'mod-v1']
    expect([...input].sort(naturalSort)).toEqual(['mod-v1', 'mod-v2', 'mod-v10'])
  })

  it('is case-insensitive (base sensitivity)', () => {
    expect(naturalSort('Apple', 'apple')).toBe(0)
  })

  it('returns negative/positive consistent with ordering', () => {
    expect(naturalSort('a', 'b')).toBeLessThan(0)
    expect(naturalSort('b', 'a')).toBeGreaterThan(0)
  })
})
