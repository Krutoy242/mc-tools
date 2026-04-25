import type { InstalledAddon, Minecraftinstance } from '../src/minecraftinstance.js'
import { describe, expect, it } from 'vitest'
import { loadMCInstanceFiltered, modListDiff, modListUnion } from '../src/index.js'
import { asAddonID, asFileID } from '../src/minecraftinstance.js'

function mockAddon(id: number, fileId: number, fileName: string, isAvailable = true): InstalledAddon {
  return {
    addonID       : asAddonID(id),
    name          : `Mod ${id}`,
    fileNameOnDisk: fileName,
    installedFile : {
      id            : asFileID(fileId),
      isAvailable,
      fileNameOnDisk: fileName,
    },
  } as InstalledAddon
}

function mockInstance(addons: InstalledAddon[]): Minecraftinstance {
  return {
    installedAddons: addons,
  } as Minecraftinstance
}

describe('mod list functions', () => {
  const mod1 = mockAddon(1, 101, 'mod1.jar')
  const mod2 = mockAddon(2, 201, 'mod2.jar')
  const mod3 = mockAddon(3, 301, 'mod3.jar', false) // Unavailable

  const instance1 = mockInstance([mod1, mod2, mod3])

  it('loadMCInstanceFiltered should filter unavailable mods', () => {
    const filtered = loadMCInstanceFiltered(instance1)
    expect(filtered.installedAddons).toHaveLength(2)
    expect(filtered.installedAddons).toContainEqual(mod1)
    expect(filtered.installedAddons).toContainEqual(mod2)
    expect(filtered.installedAddons).not.toContainEqual(mod3)
  })

  it('loadMCInstanceFiltered should filter mods by ignore patterns', () => {
    const filtered = loadMCInstanceFiltered(instance1, 'mod1.jar')
    expect(filtered.installedAddons).toHaveLength(1)
    expect(filtered.installedAddons).toContainEqual(mod2)
  })

  it('modListUnion should return all filtered mods', () => {
    const union = modListUnion(instance1)
    expect(union.union).toHaveLength(2)
    expect(union.union).toContainEqual(mod1)
    expect(union.union).toContainEqual(mod2)
  })

  it('modListDiff should detect added, removed, and updated mods', () => {
    const mod1Updated = mockAddon(1, 102, 'mod1-new.jar')
    const mod4 = mockAddon(4, 401, 'mod4.jar')

    const instance2 = mockInstance([mod1Updated, mod3, mod4]) // mod2 removed, mod1 updated, mod4 added, mod3 still unavailable

    const diff = modListDiff(instance2, instance1)

    expect(diff.added).toHaveLength(1)
    expect(diff.added![0].addonID).toBe(asAddonID(4))

    expect(diff.removed).toHaveLength(1)
    expect(diff.removed![0].addonID).toBe(asAddonID(2))

    expect(diff.updated).toHaveLength(1)
    expect(diff.updated![0].now.addonID).toBe(asAddonID(1))
    expect(diff.updated![0].now.installedFile.id).toBe(asFileID(102))
    expect(diff.updated![0].was.installedFile.id).toBe(asFileID(101))

    expect(diff.both).toHaveLength(1) // Only mod1 is in both (even if updated)
    expect(diff.both![0].addonID).toBe(asAddonID(1))

    expect(diff.union).toHaveLength(3) // mod1, mod2, mod4
  })
})
