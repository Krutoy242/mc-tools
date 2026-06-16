import { describe, expect, it } from 'vitest'

import { extractVersionLabel, formatDuration, runConcurrent } from '../src/utils/misc.js'

describe('formatDuration', () => {
  it('uses ms below one second', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('uses seconds at/above one second', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
  })
})

describe('extractVersionLabel', () => {
  it('extracts a v-prefixed version', () => {
    expect(extractVersionLabel('mymod-v1.2.3.jar')).toBe('v1.2.3')
  })

  it('extracts a numeric version', () => {
    expect(extractVersionLabel('mymod-1.2.3.jar')).toBe('1.2.3')
  })

  it('returns undefined when no version-like segment exists', () => {
    expect(extractVersionLabel('mymod.jar')).toBeUndefined()
  })
})

describe('runConcurrent', () => {
  it('maps items preserving input order', async () => {
    const out = await runConcurrent([1, 2, 3], async x => x * 2, 2)
    expect(out).toEqual([2, 4, 6])
  })

  it('returns empty array for empty input', async () => {
    expect(await runConcurrent([], async (x: number) => x, 2)).toEqual([])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await runConcurrent(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise(r => setTimeout(r, 5))
        active--
      },
      3
    )
    expect(peak).toBeLessThanOrEqual(3)
  })
})
