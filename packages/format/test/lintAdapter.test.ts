import type { LintAdapter } from '../src/index.js'
import { Linter } from 'eslint'

import { describe, expect, it } from 'vitest'

import { formatZs, formatZsSync } from '../src/index.js'

/**
 * Pass-through adapter — exercises the formatZs / formatZsSync seam without
 * requiring a TS-aware parser. The TS produced by `zsToTs` contains TS-only
 * syntax (`declare type int = number`) that espree cannot parse, so a real
 * lint run is left to the eslint-plugin-zs integration tests.
 */
function passthroughAdapter(): LintAdapter {
  return {
    fix: ts => ({ output: ts, errorCount: 0 }),
  }
}

describe('formatZs / formatZsSync', () => {
  it('runs the full pipeline against a sync adapter and revert-round-trips', () => {
    const zs = 'val x = 1;\n'
    const result = formatZsSync(zs, passthroughAdapter())
    expect(result.output.trim()).toBe('val x = 1;')
    expect(result.errorCount).toBe(0)
  })

  it('formatZs awaits an async adapter', async () => {
    const adapter: LintAdapter = {
      async fix(ts) {
        await Promise.resolve()
        return { output: ts, errorCount: 0 }
      },
    }
    const result = await formatZs('val x = 1;\n', adapter)
    expect(result.output.trim()).toBe('val x = 1;')
  })

  it('formatZsSync rejects an async adapter', () => {
    const adapter: LintAdapter = {
      async fix(ts) { return { output: ts, errorCount: 0 } },
    }
    expect(() => formatZsSync('val x = 1;', adapter)).toThrow(/Promise/)
  })

  it('throws ZsParseError on malformed input', () => {
    expect(() => formatZsSync('var x = ;', passthroughAdapter())).toThrow()
  })

  it('linter-backed adapter satisfies the LintAdapter contract', () => {
    // Sanity-check: a flat-config Linter wrapped as an adapter is what the
    // eslint-plugin uses internally. Here we feed plain JS to keep parsing
    // out of the picture.
    const linter = new Linter({ configType: 'flat' })
    const config: Linter.Config[] = [{
      files: ['**/*.js'],
      rules: { 'no-extra-semi': 'error' },
    }]
    const adapter: LintAdapter = {
      fix: (src, filename) => {
        const r = linter.verifyAndFix(src, config, { filename })
        return { output: r.output, errorCount: r.messages.filter(m => m.severity === 2).length }
      },
    }
    const out = adapter.fix('var x = 1;;', 'foo.js')
    expect(out).not.toBeInstanceOf(Promise)
    if (out instanceof Promise) return
    expect(out.output).toBe('var x = 1;')
    expect(out.errorCount).toBe(0)
  })
})
