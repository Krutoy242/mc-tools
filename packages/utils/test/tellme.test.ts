import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getCSV } from '../src/mods/tellme.js'

describe('getCSV', () => {
  it('parses a CSV file into row objects keyed by header', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mctools-csv-'))
    const file = join(dir, 'data.csv')
    writeFileSync(file, 'name,value\nfoo,1\nbar,2\n')
    expect(getCSV(file)).toEqual([
      { name: 'foo', value: '1' },
      { name: 'bar', value: '2' },
    ])
  })
})
