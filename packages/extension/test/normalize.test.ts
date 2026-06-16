import { describe, expect, it } from 'vitest'

import { normalizeConfigName, normalizeJarName } from '../src/util/normalize.js'

describe('normalizeJarName', () => {
  it('strips version, mc tag, leading markers and punctuation', () => {
    expect(normalizeJarName('!JEI-1.12.2-4.16.1.301.jar')).toBe('jei')
    expect(normalizeJarName('AppleCore-mc1.12.2-3.2.0.jar')).toBe('applecore')
  })

  it('handles a disabled jar suffix', () => {
    expect(normalizeJarName('SomeMod-1.0.jar.disabled')).toBe('somemod')
  })
})

describe('normalizeConfigName', () => {
  it('drops extension and non-alphanumerics', () => {
    expect(normalizeConfigName('JEI.cfg')).toBe('jei')
    expect(normalizeConfigName('Some_Mod.json')).toBe('somemod')
  })
})
