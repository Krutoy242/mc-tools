import { describe, expect, it } from 'vitest'

import { createSortFn } from '../src/sort.js'

// The comparator reads an arbitrary dotted path off each item; exercise it with
// plain objects (the real types are structurally compatible).
type Cmp = (a: object, b: object) => number

describe('createSortFn', () => {
  it('sorts ascending by a numeric key', () => {
    const cmp = createSortFn('weight') as unknown as Cmp
    const arr = [{ weight: 3 }, { weight: 1 }, { weight: 2 }]
    expect([...arr].sort(cmp)).toEqual([{ weight: 1 }, { weight: 2 }, { weight: 3 }])
  })

  it('sorts descending when the key is prefixed with "/"', () => {
    const cmp = createSortFn('/weight') as unknown as Cmp
    const arr = [{ weight: 1 }, { weight: 3 }, { weight: 2 }]
    expect([...arr].sort(cmp)).toEqual([{ weight: 3 }, { weight: 2 }, { weight: 1 }])
  })

  it('treats missing keys as 0', () => {
    const cmp = createSortFn('weight') as unknown as Cmp
    expect(cmp({}, { weight: 5 })).toBeLessThan(0)
  })
})
