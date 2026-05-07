import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { revert, zsToTs } from '../src/index.js'

const FIXTURE = resolve(__dirname, 'fixtures/processUtils.zs')

describe('zsToTs (forward pass)', () => {
  it('parses processUtils.zs without errors', () => {
    const source = readFileSync(FIXTURE, 'utf8')
    const result = zsToTs(source)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The Peggy grammar emits a debris fence at the top.
    expect(result.ts).toContain('CONVERSION_DEBRIS')
    // No unmatched <captures> should leak out.
    expect(result.ts).not.toMatch(/^<\w+:/m)
  })

  it('returns a structured error for malformed input', () => {
    const result = zsToTs('var x = ;')
    expect(result.ok).toBe(false)
  })

  it('parses optional chaining operator (?.)', () => {
    const source = `
function foo(str as string) as string {
  return str?.trim();
}`
    const result = zsToTs(source)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.ts).toContain('str?.trim()')
    }
  })

  it('preserves explicit type casts', () => {
    const source = 'val a = 3.14f as int * 2;'
    const fwd = zsToTs(source)
    expect(fwd.ok).toBe(true)
    if (!fwd.ok) return
    const back = revert(fwd.ts)
    expect(back.trim()).toBe(source)
  })
})

describe('revert (reverse pass)', () => {
  it('removes the conversion debris fence', () => {
    expect(revert(`
// CONVERSION_DEBRIS
declare type int = number;
// CONVERSION_DEBRIS
var x = 1;
`)).not.toContain('CONVERSION_DEBRIS')
  })

  it('round-trips processUtils.zs without ESLint (idempotent on already-formatted source)', () => {
    const source = readFileSync(FIXTURE, 'utf8').replace(/\r/g, '')
    const fwd = zsToTs(source)
    expect(fwd.ok).toBe(true)
    if (!fwd.ok) return
    const back = revert(fwd.ts)
    // Compare ignoring leading/trailing whitespace; the debris fence inserts
    // a blank line at the top of the TS that gets squashed back to nothing.
    expect(back.trim()).toBe(source.trim())
  })
})

describe('cli smoke', () => {
  it('exits with non-zero when called without arguments', () => {
    expect(() => execSync('npx tsx src/cli.ts', { stdio: 'pipe' }))
      .toThrow()
  })
})
