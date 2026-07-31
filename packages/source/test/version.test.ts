import { describe, expect, it } from 'vitest'

import { isBuildOf, versionFromFileName, versionFromGradle, versionFromProperties } from '../src/version.js'

describe('versionFromFileName', () => {
  it.each([
    ['MCT-ImmersiveTechnology-1.12.2-1.10.203-release.jar', '1.10.203'],
    ['Fluidlogged-API-v3.3.3-mc1.12.2.jar', '3.3.3'],
    ['!mixinbooter-11.12.jar', '11.12'],
    ['HadEnoughItems_1.12.2-4.32.0.jar', '4.32.0'],
    ['TinkersAntique-1.12.2-2.13.0.208.jar', '2.13.0.208'],
    ['codechickenlib-3.3.7-universal.jar', '3.3.7'],
    ['thaumic-energistics-extended-life-1.12.2-2.5.2.jar', '2.5.2'],
    ['MmmMmmMmmMmm-1.12-2.0.7.jar', '2.0.7'],
    ['obscure_tooltips-forge-1.12.2-3.10.2.jar', '3.10.2'],
    ['+Fugue-0.23.7.jar', '0.23.7'],
    ['!!!CrashAssistant-forge-1.12.2-1.11.11.jar', '1.11.11'],
    ['random_complement-1.9.5.jar', '1.9.5'],
    ['ActuallyAdditions-1.12.2-r157.jar', 'r157'],
    ['StellarCore-1.6.0.jar.disabled', '1.6.0'],
  ])('%s → %s', (fileName, expected) => {
    expect(versionFromFileName(fileName)).toBe(expected)
  })

  it('returns null when no version is present', () => {
    expect(versionFromFileName('Botania.jar')).toBeNull()
  })
})

describe('versionFromProperties', () => {
  it('reads mod_version with spaces around the separator', () => {
    expect(versionFromProperties('mod_version = 1.9.5\nmapping_version = 39')).toBe('1.9.5')
  })

  it('joins the MCT-style split version', () => {
    expect(versionFromProperties('modversion=1.10\nmodsubversion=197')).toBe('1.10.197')
  })

  it('ignores interpolated placeholders', () => {
    expect(versionFromProperties(`mod_version=$\{env.VERSION}`)).toBeNull()
  })

  it('falls back to a bare version key', () => {
    expect(versionFromProperties('version = 1.11.9\nminecraft_version = 1.12.2')).toBe('1.11.9')
  })
})

describe('versionFromGradle', () => {
  it('reads a top-level assignment', () => {
    expect(versionFromGradle('plugins {\n  id("x") version "1.1.7"\n}\nversion = "1.6.0"\n')).toBe('1.6.0')
  })

  it('ignores interpolated assignments', () => {
    expect(versionFromGradle(`version = "$\{config.minecraft_version}-$\{artifact_version}"`)).toBeNull()
  })

  it('reads an ext property of a multi-project build', () => {
    expect(versionFromGradle('ext.craftTweakerVersion = "4.1.20"\n')).toBe('4.1.20')
  })

  it('skips versions of tools and dependencies', () => {
    expect(versionFromGradle('  gradleVersion = \'4.9\'\n  forgeVersion = "14.23.5.2847"\n')).toBeNull()
  })

  it('prefers the mod version over a later tool version', () => {
    expect(versionFromGradle('version = "4.0.20"\nwrapper {\n  gradleVersion = \'4.9\'\n}\n')).toBe('4.0.20')
  })
})

describe('isBuildOf', () => {
  it.each([
    ['4.0.20', '4.0.20.11', true],
    ['4.1.20', '4.1.20.715', true],
    ['4.0.20', '4.0.20', false],
    ['4.0.20', '4.0.21.11', false],
    ['4.1.20', '1.12-4.1.20.715', false],
    ['1.6', '1.6.0.1', false],
  ])('%s vs %s → %s', (base, full, expected) => {
    expect(isBuildOf(base, full)).toBe(expected)
  })
})
