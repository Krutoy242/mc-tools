import type { MinecraftInstance } from '../src/types.js'

import { describe, expect, it } from 'vitest'
import { resolveContext } from '../src/index.js'
import { findAddon } from '../src/instance.js'

const instance: MinecraftInstance = {
  installedAddons: [
    { addonID: 225643, name: 'Botania', fileNameOnDisk: 'Botania-1.12.2.jar' },
    { addonID: 238222, name: 'Just Enough Items', fileNameOnDisk: 'jei_1.12.2.jar' },
  ],
}

describe('findAddon', () => {
  it('matches by exact addon id', () => {
    expect(findAddon(instance, '225643')?.name).toBe('Botania')
  })

  it('matches by case-insensitive name substring', () => {
    expect(findAddon(instance, 'botania')?.addonID).toBe(225643)
  })

  it('matches by jar filename fragment', () => {
    expect(findAddon(instance, 'jei_')?.name).toBe('Just Enough Items')
  })

  it('returns undefined when nothing matches', () => {
    expect(findAddon(instance, 'nope')).toBeUndefined()
  })
})

describe('resolveContext', () => {
  it('normalizes paths to forward slashes and applies options', () => {
    const ctx = resolveContext({ modSources: 'C:\\src\\mods', mcDir: 'C:\\mc', cfApiKey: 'k', silent: true })
    expect(ctx.modSources).toBe('C:/src/mods')
    expect(ctx.mcDir).toBe('C:/mc')
    expect(ctx.cfApiKey).toBe('k')
    expect(typeof ctx.log).toBe('function')
  })
})
