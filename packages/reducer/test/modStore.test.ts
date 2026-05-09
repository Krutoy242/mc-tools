import { resolve } from 'pathe'
import { describe, expect, it } from 'vitest'
import { getConfig } from '../src/config.js'
import { ModStore, readModpackName } from '../src/ModStore.js'

const MC_PATH = resolve(__dirname)

describe('modStore', () => {
  it('loads the test fixture asynchronously', async () => {
    const config = await getConfig(MC_PATH)
    const store = await ModStore.load(MC_PATH, config)
    expect(store.mods.length).toBeGreaterThan(0)
    // The fixture has an empty installedAddons array, so every mod should
    // produce a noAddon warning.
    expect(store.warnings.some(w => w.kind === 'noAddon')).toBe(true)
  })

  it('readModpackName falls back to dir basename when no manifest is present', async () => {
    const name = await readModpackName(MC_PATH)
    expect(name).toBeTruthy()
    expect(typeof name).toBe('string')
  })
})
