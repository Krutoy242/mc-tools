import { describe, expect, it, vi } from 'vitest'

import { createAntilooped } from '../src/antiloop.js'

describe('createAntilooped', () => {
  it('runs the wrapped fn and returns its result on first call', () => {
    const fn = vi.fn(() => 42)
    const run = createAntilooped('self', fn)
    expect(run()).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('returns 0 and skips fn when self is already in the shared set', () => {
    const fn = vi.fn(() => 42)
    const run = createAntilooped('self', fn)
    const shared = new Set<string>()
    expect(run(shared)).toBe(42)
    expect(run(shared)).toBe(0)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
