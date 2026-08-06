import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { activate, deactivate } from '../src/extension.js'
import { recorder, resetRecorder, state } from './stubs/vscode.js'

function makeContext() {
  const subscriptions: Array<{ dispose: () => void }> = []
  return { subscriptions }
}

describe('activation in a non-modpack workspace', () => {
  let dir: string

  beforeEach(async () => {
    resetRecorder()
    dir = await mkdtemp(join(tmpdir(), 'mctools-plain-'))
    state.workspaceFolders = [{ uri: { fsPath: dir } }]
    state.settings = new Map()
  })

  afterEach(async () => {
    deactivate()
    state.workspaceFolders = undefined
    await rm(dir, { recursive: true, force: true })
  })

  it('activates without throwing', async () => {
    await expect(activate(makeContext() as never)).resolves.toBeUndefined()
  })

  it('still registers the palette commands so they never resolve as missing', async () => {
    await activate(makeContext() as never)
    expect(recorder.commands).toContain('mc-tools.showDebugLogPanel')
    expect(recorder.commands).toContain('mc-tools.showCtErrors')
  })

  it('reports itself as not-a-modpack', async () => {
    await activate(makeContext() as never)
    expect(recorder.contextKeys.get('mc-tools:isModpack')).toBe(false)
  })

  it('creates no tree view, so the contributed view stays hidden', async () => {
    await activate(makeContext() as never)
    // A contributed view with no provider renders as "no data provider
    // registered" — gating it on mc-tools:modTrackerActive avoids that.
    expect(recorder.treeViews).toEqual([])
    expect(recorder.contextKeys.get('mc-tools:modTrackerActive')).toBeUndefined()
  })

  it('deactivates cleanly', async () => {
    await activate(makeContext() as never)
    expect(() => deactivate()).not.toThrow()
  })
})

describe('activation in a modpack workspace', () => {
  let dir: string

  beforeEach(async () => {
    resetRecorder()
    dir = await mkdtemp(join(tmpdir(), 'mctools-pack-'))
    await mkdir(join(dir, 'mods'), { recursive: true })
    await writeFile(
      join(dir, 'minecraftinstance.json'),
      JSON.stringify({ installedAddons: [] }),
      'utf-8'
    )
    state.workspaceFolders = [{ uri: { fsPath: dir } }]
    state.settings = new Map()
  })

  afterEach(async () => {
    deactivate()
    state.workspaceFolders = undefined
    await rm(dir, { recursive: true, force: true })
  })

  it('activates without throwing when the logs are absent', async () => {
    // A pack that has never been launched has no debug.log or crafttweaker.log;
    // those features must degrade to a no-op rather than fail activation.
    await expect(activate(makeContext() as never)).resolves.toBeUndefined()
  })

  it('marks the workspace as a modpack', async () => {
    await activate(makeContext() as never)
    expect(recorder.contextKeys.get('mc-tools:isModpack')).toBe(true)
  })

  it('registers the mod tracker view and its commands', async () => {
    await activate(makeContext() as never)
    expect(recorder.treeViews).toEqual(['mc-tools.modChanges'])
    expect(recorder.contextKeys.get('mc-tools:modTrackerActive')).toBe(true)
    expect(recorder.commands).toEqual(
      expect.arrayContaining([
        'mc-tools.refreshModChanges',
        'mc-tools.stageMod',
        'mc-tools.stageAllMods',
        'mc-tools.updateModsMd',
        'mc-tools.updateManifest',
      ])
    )
  })

  it('honours the per-feature enabled flags', async () => {
    state.settings.set('modTracker.enabled', false)
    await activate(makeContext() as never)
    expect(recorder.treeViews).toEqual([])
    expect(recorder.commands).not.toContain('mc-tools.stageAllMods')
  })
})

describe('activation with no workspace open', () => {
  beforeEach(() => {
    resetRecorder()
    state.workspaceFolders = undefined
    state.settings = new Map()
  })

  afterEach(() => {
    deactivate()
  })

  it('stays idle instead of throwing', async () => {
    await expect(activate(makeContext() as never)).resolves.toBeUndefined()
    expect(recorder.contextKeys.get('mc-tools:isModpack')).toBe(false)
  })
})
