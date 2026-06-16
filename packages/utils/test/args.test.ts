import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertPath } from '../src/args.js'

describe('assertPath', () => {
  it('returns the resolved absolute path when it exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mctools-args-'))
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'x')
    expect(assertPath(file)).toBe(resolve(file))
  })

  it('throws a descriptive error when the path is missing', () => {
    expect(() => assertPath('definitely/not/here.xyz')).toThrow(/doesnt exist/)
  })

  it('includes custom error text when provided', () => {
    expect(() => assertPath('nope.xyz', 'custom message')).toThrow(/custom message/)
  })
})
