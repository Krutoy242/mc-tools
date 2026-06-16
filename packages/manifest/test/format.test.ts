import type { ModpackManifestFile } from '../src/index.js'

import { describe, expect, it } from 'vitest'

import { formatModList } from '../src/index.js'

const files: ModpackManifestFile[] = [
  { projectID: 1, fileID: 2, ___name: 'Alpha', downloadUrl: 'u1', required: true },
  { projectID: 30, fileID: 400, ___name: 'Beta', downloadUrl: 'u2', required: true },
]

describe('formatModList', () => {
  it('stays valid JSON that round-trips to the input', () => {
    // Padding/newlines are only whitespace, so the result must still parse back.
    expect(JSON.parse(formatModList(files))).toEqual(files)
  })

  it('emits the multi-line file-list layout', () => {
    const out = formatModList(files)
    expect(out).toContain('[\n    {')
    expect(out).toContain('},\n    {')
    expect(out).toContain('}\n  ]')
  })
})
