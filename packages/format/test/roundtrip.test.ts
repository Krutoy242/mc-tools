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

  it('parses `[A][B]` as a map type (key=B, value=List<A>) — the ZS list-keyed map sugar', () => {
    // In ZS, `[A][B]` is sugar for "map keyed by B whose values are lists of
    // A". Syntactically: a list type literal `[A]` followed by a `[B]` index.
    // The grammar previously only allowed the `[…]` indexing suffix on
    // TypePath, so `val a as [int][string];` failed to parse.
    const cases = [
      'val a as [int][string];',
      'val b as [string][int];',
      // Nested list-keyed maps. The LIST revert previously used a non-greedy
      // `Array<(.+?)>` regex that mis-matched across nested `<>` pairs;
      // `revertLists` now peels innermost-first until stable.
      'val c as [[int][string]][[string][int]];',
      'val d as [[int]][string];',
      'val e as [[[int]]];',
      'val f as [[int][string]][[string][int]] = {} as [[int][string]][[string][int]];',
    ]
    for (const source of cases) {
      const fwd = zsToTs(source)
      expect(fwd.ok, `forward parse should succeed for: ${source}`).toBe(true)
      if (!fwd.ok) continue
      expect(revert(fwd.ts).trim()).toBe(source)
    }
  })

  it('keeps quotes around ZS-keyword string keys (e.g. `function`)', () => {
    // `function` is a ZS keyword. As an *object key* the ZS grammar accepts
    // it via PropertyName→IdentifierName, but in many surrounding contexts
    // a bare `function` token reads as the start of a function definition.
    // The forward pass quotes it; revert's UNQUOTE_KEY rule (which strips
    // quotes from any `[a-z_]\w*` key) currently strips them anyway,
    // producing invalid ZS. Other ZS keywords (`val`, `var`, `as`, `if`,
    // `else`, `for`, `while`, `return`, `import`, `static`, `global`,
    // `zenClass`, etc.) have the same problem.
    const cases = [
      `val m as string[string] = { 'function': 'foo' } as string[string];`,
      `val m as string[string] = { 'val': 'foo' } as string[string];`,
      `val m as string[string] = { 'static': 'foo' } as string[string];`,
    ]
    for (const source of cases) {
      const fwd = zsToTs(source)
      expect(fwd.ok, `forward parse should succeed for: ${source}`).toBe(true)
      if (!fwd.ok) continue
      expect(revert(fwd.ts).trim()).toBe(source)
    }
  })

  it('keeps parens around a cast when followed by member access / call', () => {
    // `(A as B).c()` — ESLint may strip the redundant outer parens around the
    // CallExpression `__as<B>(A)` (since member access on a call is fine in
    // TS without parens). Revert must put them back, otherwise ZS would read
    // `A as B.c()` as `A as (B.c)()` (TypePath allows `.`).
    const cases = [
      'val a = (x as int).foo;',
      'val a = (x as int).foo();',
      'val a = (x as int)[0];',
      'val a = (x as int)?.foo;',
      'val a = (x as int)(y);',
    ]
    for (const source of cases) {
      const fwd = zsToTs(source)
      expect(fwd.ok).toBe(true)
      if (!fwd.ok) return
      // Mimic ESLint's `no-extra-parens` stripping the outer parens around
      // the `__as<…>(…)` CallExpression.
      const lintedLike = fwd.ts.replace(/\(__as</g, '__as<')
        .replace(/\)\)(?=[.[(]|\?\.)/g, ')')
      expect(revert(lintedLike).trim()).toBe(source)
    }
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
