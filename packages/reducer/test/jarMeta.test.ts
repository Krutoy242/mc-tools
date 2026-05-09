import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { loadJarMeta } from '../src/jarMeta.js'

// The placeholder jars in test/mods/ are not valid zips — they only exist for
// filename-based logic. For real jar parsing we use the actual modpack mods/.
const REAL_MODS = resolve(__dirname, '../../../../mods')

const skipIfMissing = existsSync(REAL_MODS) ? describe : describe.skip

skipIfMissing('jarMeta (real jars)', () => {
  const sample = existsSync(REAL_MODS)
    ? readdirSync(REAL_MODS).find(f => f.endsWith('.jar'))
    : undefined

  it('reads class count from a real jar without decompressing payload', async () => {
    if (!sample) return
    const meta = await loadJarMeta(REAL_MODS, sample)
    expect(meta.entryCount).toBeGreaterThan(0)
    expect(meta.classCount).toBeGreaterThanOrEqual(0)
    expect(meta.size).toBeGreaterThan(0)
  })

  it('returns the same meta on a second call (deterministic)', async () => {
    if (!sample) return
    const a = await loadJarMeta(REAL_MODS, sample)
    const b = await loadJarMeta(REAL_MODS, sample)
    expect(a).toEqual(b)
  })
})
