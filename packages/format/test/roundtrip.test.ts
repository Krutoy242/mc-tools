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

  it('wraps casts as `__as<T>(...)` so ESLint cannot strip them', () => {
    const fwd = zsToTs('val x = 0.1 as int as double;')
    expect(fwd.ok).toBe(true)
    if (!fwd.ok) return
    // Chained casts nest left-to-right; no raw `as` keyword survives in the
    // emitted TS expression (the only `as` is inside string-form types).
    expect(fwd.ts).toContain('__as<double>(__as<int>(0.1))')
    expect(revert(fwd.ts).trim()).toBe('val x = 0.1 as int as double;')
  })

  it('emits negative numeric object keys as quoted strings (no bracket markers)', () => {
    const fwd = zsToTs('static m as int[int] = { 0: 1, -1: 2 } as int[int];')
    expect(fwd.ok).toBe(true)
    if (!fwd.ok) return
    // Quoted form; no `[-1]` computed-key + marker leftover.
    expect(fwd.ts).toContain(`'-1'`)
    expect(fwd.ts).not.toContain('/* _ */[-1')
  })

  it('preserves colon-alignment of object literals through quoted-key revert', () => {
    // Simulate what ESLint produces with `quote-props: consistent-as-needed`
    // + `key-spacing` align: every key quoted, colons in the same column.
    // `'-1'` is what our forward pass now emits for a negative ZS key.
    const linted = `
const m = {
  '0' : 'a',
  '-1': 'b',
};`
    const back = revert(linted)
    // After revert: quotes stripped uniformly (-2 chars per line), so the
    // colons remain in the SAME column relative to each other.
    const lines = back.split('\n').filter(l => l.includes(':'))
    const colonCols = lines.map(l => l.indexOf(':'))
    expect(new Set(colonCols).size).toBe(1)
    // And the keys came out as bare ZS literals.
    expect(back).toContain('0 ')
    expect(back).toContain('-1:')
  })

  it('round-trips chained casts even after ESLint-style transformations', () => {
    // Simulate what `ts/no-unnecessary-type-assertion` would do to the OLD
    // (raw `as`) emission: collapse chained assertions. The new wrapper is
    // a function call, so ESLint cannot rewrite it — revert sees it intact.
    const fwd = zsToTs('val n = (a + b) as int;')
    expect(fwd.ok).toBe(true)
    if (!fwd.ok) return
    // After ESLint removes the inner redundant parens around a binary expr.
    const lintedLike = fwd.ts.replace('((a + b))', '(a + b)')
    expect(revert(lintedLike).trim()).toBe('val n = (a + b) as int;')
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
