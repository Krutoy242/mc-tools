import type { CompiledConfig } from '../src/index.js'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from 'citty'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { parse as parseYaml } from 'yaml'

import { main } from '../src/cli.js'
import { compileConfig, findErrors, parseConfig } from '../src/index.js'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let defaultConfig: CompiledConfig
let sampleLog: string

beforeAll(async () => {
  defaultConfig = compileConfig(parseConfig(parseYaml(await readFile(resolve(pkgRoot, 'src/config.yml'), 'utf8'))))
  sampleLog = await readFile(resolve(pkgRoot, 'test/debug.log'), 'utf8')
})

describe('findErrors (pure)', () => {
  it('finds three errors in sample log with default config', () => {
    const errors = findErrors(sampleLog, defaultConfig)
    expect(errors).toHaveLength(3)
    expect(errors[0].text).toContain('Coremod EyeOfDragonsPlugin')
    expect(errors[1].text).toContain('HadEnoughItems')
    expect(errors[2].text).toContain('Unidentified mapping')
  })

  it('preserves line numbers from original log', () => {
    const errors = findErrors(sampleLog, defaultConfig)
    // 0-based line offsets (VS Code `Position` convention) — the extension's
    // debug-log provider consumes these directly without adjustment.
    expect(errors[0].line).toBe(1)
    expect(errors[1].line).toBe(9)
    expect(errors[2].line).toBe(11)
  })

  it('returns empty array (does not throw) when no entries match', () => {
    const config = parseConfig({
      match  : '^DEFINITELY_NEVER_MATCHES_XYZ$',
      ignore : '',
      replace: [],
    })
    expect(findErrors(sampleLog, config)).toEqual([])
  })

  it('defaults to start of file when boundary "from" pattern is not found', () => {
    const config = parseConfig({
      match     : 'ERROR',
      ignore    : '',
      replace   : [],
      boundaries: { from: 'NEVER_MATCHES_XYZ' },
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('defaults to end of file when boundary "to" pattern is not found', () => {
    const config = parseConfig({
      match     : 'ERROR',
      ignore    : '',
      replace   : [],
      boundaries: { to: 'NEVER_MATCHES_XYZ' },
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('uses fast-path alternation for ignore list (single regex test)', () => {
    const config = compileConfig(parseConfig({
      match  : '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/(WARN|ERROR)\\][^\\n]*',
      ignore : ['HadEnoughItems', 'Coremod', 'Unidentified', 'mixin', 'smoothfont'],
      replace: [],
    }))
    expect(config.ignoreFast).toBeInstanceOf(RegExp)
    expect(config.ignoreFast?.source).toContain('|')
    // All entries should be filtered out by the merged alternation regex.
    expect(findErrors(sampleLog, config)).toEqual([])
  })

  it('groups errors via Map preserving order between groups', () => {
    const config = parseConfig({
      match  : '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/(WARN|ERROR)\\][^\\n]*',
      ignore : '',
      replace: [],
      groupBy: ['HadEnoughItems'],
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })

  it('parseConfig throws aggregated error on invalid input', () => {
    expect(() => parseConfig({ match: 123, replace: [], ignore: '' }))
      .toThrow(/Invalid errors config:\s+- match:/)
    expect(() => parseConfig(null)).toThrow(/Invalid errors config:\s+- <root>:/)
  })

  it('clips log to boundaries.from when pattern matches', () => {
    // `boundaries.from` matches at line 8 (first mixin warning); the earlier
    // EyeOfDragons error must be excluded.
    const config = parseConfig({
      match     : '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/(WARN|ERROR)\\][^\\n]*',
      ignore    : '',
      replace   : [],
      boundaries: { from: 'spectral_edge' },
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.every(e => !e.text.includes('EyeOfDragons'))).toBe(true)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('clips log between boundaries.from and boundaries.to', () => {
    const config = parseConfig({
      match     : '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/(WARN|ERROR)\\][^\\n]*',
      ignore    : '',
      replace   : [],
      boundaries: { from: 'spectral_edge', to: 'HadEnoughItems' },
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.every(e => !e.text.includes('HadEnoughItems'))).toBe(true)
    expect(errors.every(e => !e.text.includes('Unidentified'))).toBe(true)
  })

  it('throws when boundaries leave empty slice', () => {
    // `to` matches at the very start ⇒ from === to ⇒ empty slice.
    const config = parseConfig({
      match     : 'ERROR',
      ignore    : '',
      replace   : [],
      boundaries: { to: '\\[15:11:35\\] \\[main' },
    })
    expect(() => findErrors(sampleLog, config)).toThrow(/no log text left/)
  })

  it('applies replace transforms to matched entries', () => {
    const config = parseConfig({
      match  : '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/ERROR\\][^\\n]*',
      ignore : '',
      replace: [{ from: '^\\[\\d+:\\d+:\\d+\\] ', to: '' }],
    })
    const errors = findErrors(sampleLog, config)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every(e => !/^\[\d+:\d+:\d+\]/.test(e.text))).toBe(true)
  })

  it('compileConfig emits null ignoreFast for empty ignore string', () => {
    const compiled = compileConfig(parseConfig({ match: 'ERROR', ignore: '', replace: [] }))
    expect(compiled.ignoreFast).toBeNull()
  })

  it('accepts a Config (not yet compiled) and compiles internally', () => {
    const config = parseConfig({ match: 'ERROR', ignore: '', replace: [] })
    expect(findErrors(sampleLog, config).length).toBeGreaterThan(0)
  })
})

describe('cli smoke', () => {
  it('runs end-to-end and exits with code 1 when errors are found', async () => {
    const chunks: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk))
      return true
    })

    await runCommand(main, { rawArgs: [`--log=${resolve(pkgRoot, 'test/debug.log')}`] })

    spy.mockRestore()

    const stdout = chunks.join('')
    expect(stdout).toContain('Found 3 errors')
    expect(process.exitCode).toBe(1)
  })
})
