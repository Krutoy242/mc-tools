import { describe, expect, it } from 'vitest'

import { isInsideSubmodule, parseSubmodulePaths } from '../src/util/gitmodules.js'

// Mirrors the real E2E-E .gitmodules, which is what made `repo.add` reject.
// Git indents with hard tabs, so they are spelled out rather than typed.
const GITMODULES = [
  '[submodule "Enigmatica2Expert-Extended.wiki"]',
  '\tpath = Enigmatica2Expert-Extended.wiki',
  '\turl = https://github.com/Krutoy242/Enigmatica2Expert-Extended.wiki.git',
  '[submodule "mc-tools"]',
  '\tpath = mc-tools',
  '\turl = https://github.com/Krutoy242/mc-tools.git',
  '[submodule "scripts/craft"]',
  '\tpath = scripts/craft',
  '\turl = https://github.com/Krutoy242/Craft.zs.git',
  '',
].join('\n')

describe('parseSubmodulePaths', () => {
  it('extracts every path entry', () => {
    expect(parseSubmodulePaths(GITMODULES)).toEqual([
      'Enigmatica2Expert-Extended.wiki',
      'mc-tools',
      'scripts/craft',
    ])
  })

  it('normalises separators and trailing slashes', () => {
    expect(parseSubmodulePaths('path = scripts\\craft/')).toEqual(['scripts/craft'])
  })

  it('returns nothing for a file without submodules', () => {
    expect(parseSubmodulePaths('[core]\n\tbare = false\n')).toEqual([])
  })
})

describe('isInsideSubmodule', () => {
  const subs = parseSubmodulePaths(GITMODULES)

  it('matches the submodule root itself', () => {
    expect(isInsideSubmodule('scripts/craft', subs)).toBe(true)
    expect(isInsideSubmodule('mc-tools', subs)).toBe(true)
  })

  it('matches files nested inside a submodule', () => {
    expect(isInsideSubmodule('scripts/craft/Craft.zs', subs)).toBe(true)
    expect(isInsideSubmodule('mc-tools/packages/extension/package.json', subs)).toBe(true)
  })

  it('accepts backslash separators from Windows paths', () => {
    expect(isInsideSubmodule('scripts\\craft\\Craft.zs', subs)).toBe(true)
  })

  it('leaves ordinary pack files alone', () => {
    expect(isInsideSubmodule('scripts/mods/bloodmagic.zs', subs)).toBe(false)
    expect(isInsideSubmodule('config/jei/itemBlacklist.cfg', subs)).toBe(false)
  })

  it('does not match a prefix that is not a path boundary', () => {
    expect(isInsideSubmodule('mc-tools-extra/file.ts', subs)).toBe(false)
  })
})
