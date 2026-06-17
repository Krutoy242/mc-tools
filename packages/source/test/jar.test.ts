import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'

import { readJarEntry, readJarMcmodInfo } from '../src/jar.js'

// Real jars live in the modpack's mods/ dir (placeholder jars elsewhere are not
// valid zips). Skip gracefully when running outside the modpack checkout.
const MODS = resolve(__dirname, '../../../../mods')
const sample = existsSync(MODS) ? readdirSync(MODS).find(f => f.endsWith('.jar')) : undefined
const maybe = sample ? describe : describe.skip

maybe('jar reader (real jar)', () => {
  it('returns null for a missing entry', async () => {
    expect(await readJarEntry(resolve(MODS, sample!), 'does/not/exist.txt')).toBeNull()
  })

  it('parses mcmod.info into an array (possibly empty)', async () => {
    const entries = await readJarMcmodInfo(resolve(MODS, sample!))
    expect(Array.isArray(entries)).toBe(true)
  })
})
