import { describe, expect, it } from 'vitest'

import { getPath } from '../src/utils/object.js'

describe('getPath', () => {
  it('resolves a nested dotted path', () => {
    expect(getPath({ a: { b: 1 } }, 'a.b')).toBe(1)
  })

  it('resolves array index syntax', () => {
    expect(getPath({ a: [{ c: 2 }] }, 'a[0].c')).toBe(2)
  })

  it('returns the default when a segment is missing', () => {
    expect(getPath({ a: 1 }, 'x.y', 'def')).toBe('def')
  })

  it('returns the default for null/undefined roots', () => {
    expect(getPath(null, 'a', 'def')).toBe('def')
    expect(getPath(undefined, 'a', 'def')).toBe('def')
  })
})
