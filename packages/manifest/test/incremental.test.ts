import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { ModpackManifest } from '../src/index.js'

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { incrementalUpdateManifest } from '../src/index.js'

function addon(addonID: number, fileID: number, name: string) {
  return {
    addonID,
    name,
    installedFile: { id: fileID, downloadUrl: `url-${addonID}`, fileNameOnDisk: `${name}.jar` },
  }
}

const baseManifest = {
  minecraft      : { version: '1.12.2', modLoaders: [] },
  projectID      : 123,
  manifestType   : 'minecraftModpack',
  manifestVersion: 1,
  name           : 'Test Pack',
  version        : '1.0.0',
  author         : 'tester',
  overrides      : 'overrides',
  files          : [
    { projectID: 1, fileID: 10, ___name: 'One', downloadUrl: 'u1', required: true },
    { projectID: 2, fileID: 20, ___name: 'Two', downloadUrl: 'u2', required: true },
  ],
} satisfies ModpackManifest

describe('incrementalUpdateManifest', () => {
  it('adds new mods, updates changed ones, and drops removed ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mctools-manifest-'))
    const manifestPath = join(dir, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(baseManifest, null, 2))

    // addon 1 removed, addon 2 changed (new fileID), addon 3 added.
    const fresh = {
      installedAddons: [addon(2, 99, 'Two'), addon(3, 30, 'Three')],
    } as unknown as Minecraftinstance

    incrementalUpdateManifest(manifestPath, fresh)

    const result = JSON.parse(readFileSync(manifestPath, 'utf8')) as ModpackManifest
    expect(result.files.map(f => f.projectID)).toEqual([2, 3])
    expect(result.files.find(f => f.projectID === 2)?.fileID).toBe(99)
  })

  it('throws when the manifest file is missing', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'mctools-manifest-')), 'nope.json')
    expect(() => incrementalUpdateManifest(missing, { installedAddons: [] } as unknown as Minecraftinstance))
      .toThrow(/not found/)
  })
})
