import { describe, expect, it } from 'vitest'
import * as index from '../src/index.js'

describe('index exports', () => {
  it('should export fetchMods', () => {
    expect(typeof index.fetchMods).toBe('function')
  })

  it('should export fetchMod', () => {
    expect(typeof index.fetchMod).toBe('function')
  })

  it('should export fetchChangelogs', () => {
    expect(typeof index.fetchChangelogs).toBe('function')
  })

  it('should export fetchChangelog', () => {
    expect(typeof index.fetchChangelog).toBe('function')
  })

  it('should export fetchIntermediateFileChangelogs', () => {
    expect(typeof index.fetchIntermediateFileChangelogs).toBe('function')
  })

  it('should export fetchFiles', () => {
    expect(typeof index.fetchFiles).toBe('function')
  })

  it('should export fetchFile', () => {
    expect(typeof index.fetchFile).toBe('function')
  })

  it('should export loadMCInstanceFiltered', () => {
    expect(typeof index.loadMCInstanceFiltered).toBe('function')
  })

  it('should export modListDiff', () => {
    expect(typeof index.modListDiff).toBe('function')
  })

  it('should export modListUnion', () => {
    expect(typeof index.modListUnion).toBe('function')
  })

  it('should export setCachePath', () => {
    expect(typeof index.setCachePath).toBe('function')
  })

  it('should export asAddonID', () => {
    expect(typeof index.asAddonID).toBe('function')
  })

  it('should export asFileID', () => {
    expect(typeof index.asFileID).toBe('function')
  })
})
