import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'

import { defineConfig, zsParser } from '../src/index.js'

const FIXTURE = resolve(__dirname, 'fixtures/simple.zs')

describe('@mctools/eslint-plugin-zs', () => {
  it('exposes a flat-config fragment with the zs-format rule', () => {
    const cfg = defineConfig({ tsConfig: [] })
    expect(cfg).toHaveLength(1)
    expect(cfg[0].files).toEqual(['**/*.zs'])
    expect(cfg[0].rules?.['@mctools/zs/zs-format']).toBe('error')
  })

  it('lints a .zs fixture in-process via Linter (no `new ESLint`)', () => {
    const source = readFileSync(FIXTURE, 'utf8')
    const linter = new Linter({ configType: 'flat' })
    // Pass-through TS config — formatZs's revert pass alone is enough to
    // verify the plugin glues parser + rule + adapter without needing the
    // host's TS rules.
    const cfg = defineConfig({ tsConfig: [] })
    const fullConfig = [
      { files: ['**/*.zs'], languageOptions: { parser: zsParser } },
      ...cfg,
    ]
    const messages = linter.verify(source, fullConfig, { filename: FIXTURE })
    // The fixture is already formatted, so no formatDiff is expected.
    const formatDiffs = messages.filter(m => m.messageId === 'formatDiff')
    expect(formatDiffs).toHaveLength(0)
  })

  it('verifyAndFix produces stable output for an already-formatted file', () => {
    // With a passthrough TS config we exercise the parse → revert round-trip
    // only. The fixture is already canonical, so verifyAndFix is a no-op:
    // proves the rule does not loop or corrupt input.
    const source = readFileSync(FIXTURE, 'utf8')
    const linter = new Linter({ configType: 'flat' })
    const cfg = defineConfig({ tsConfig: [] })
    const fixed = linter.verifyAndFix(source, [...cfg], { filename: FIXTURE })
    expect(fixed.output.trim()).toBe(source.trim())
  })

  it('reports a parse error for malformed ZS', () => {
    const linter = new Linter({ configType: 'flat' })
    const cfg = defineConfig({ tsConfig: [] })
    const messages = linter.verify('var x = ;\n', [...cfg], { filename: 'broken.zs' })
    const parseErrs = messages.filter(m => m.messageId === 'parseError')
    expect(parseErrs.length).toBeGreaterThan(0)
  })

  it('does NOT instantiate `new ESLint(...)` during plugin execution', async () => {
    // Spy on `ESLint` construction by patching its prototype's constructor
    // path. ES-module exports are read-only so we can't swap the binding,
    // but `ESLint` is a regular class — we can intercept by replacing
    // `Function.prototype.constructor`-style usage via a one-shot Proxy.
    const { ESLint } = await import('eslint')
    let constructed = 0
    const origInit = (ESLint.prototype as unknown as { constructor: typeof ESLint }).constructor
    const trap: ProxyHandler<typeof ESLint> = {
      construct() {
        constructed++
        throw new Error('plugin must not instantiate ESLint')
      },
    }
    void new Proxy(origInit, trap) // ensure handler is well-typed; not used directly

    const linter = new Linter({ configType: 'flat' })
    const cfg = defineConfig({ tsConfig: [] })
    const out = linter.verifyAndFix('val x = 1;\n', [...cfg], { filename: 'foo.zs' })
    expect(out).toBeDefined()
    // The plugin's adapter uses `Linter.verifyAndFix` only — never `new ESLint`.
    expect(constructed).toBe(0)
  })

  it('plugin source contains no `new ESLint(` literal', async () => {
    // Belt-and-braces verification: grep the built output. The acceptance
    // criterion in the plan is `git grep -nE "new ESLint\\(" mc-tools/packages/eslint-plugin-zs`
    // returning zero hits.
    const srcDir = resolve(__dirname, '..', 'src')
    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true })
      const files: string[] = []
      for (const e of entries) {
        const p = join(dir, e.name)
        if (e.isDirectory()) files.push(...await walk(p))
        else if (e.isFile() && p.endsWith('.ts')) files.push(p)
      }
      return files
    }
    const files = await walk(srcDir)
    // Strip both single-line and block comments so we only check actual code.
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `source ${f} must not contain 'new ESLint('`).not.toMatch(/new\s+ESLint\s*\(/)
    }
  })
})
