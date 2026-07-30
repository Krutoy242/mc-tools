import type { IgnoreHits } from '../src/index.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { runCommand } from 'citty'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { main } from '../src/cli.js'
import { compileConfig, compileConfigFromYaml, findErrors, parseConfig } from '../src/index.js'
import { renderUnusedRules, run } from '../src/runner.js'

const MATCH = String.raw`\[\d+:\d+:\d+\] \[[^\]]+/(WARN|ERROR)\][^\n]*`

// Line numbers are the whole point of the report, so the fixture is numbered:
// the leading newline makes `match:` line 2, `ignore:` line 3, and so on.
//
//                                  4 ┐ heading
//                                  5 ┐ heading
//                                  6 ┐ leaf — used
//                                  7 ┐ leaf — dead
//                                  8 ┐ heading, same key as line 4
//                                  9 ┐ leaf — dead
//                                 10 ┐ heading
//                                 11 ┐ `key: value` leaf — used
//                                 12 ┐ bare heading, no children — dead
//                                 13 ┐ plain leaf — dead
const CONFIG = `
match: '${MATCH}'
ignore:
  - ERROR:
      - FML:
          - used leaf
          - dead leaf
  - ERROR:
      - dead second heading
  - WARN:
      - OBJModel.Parser: found a face *
  - smoothfont:
  - plain dead leaf
replace: []
`

const LOG = `[15:11:39] [main/ERROR] [FML]: used leaf here
[15:11:40] [main/WARN] [FML]: OBJModel.Parser: found a face 5 times
[15:11:41] [main/ERROR] [FML]: something nobody ignores
`

let tmp: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'mct-errors-unused-'))
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('ignore rule line numbers', () => {
  it('stamps every rule with the config line its leaf is written on', () => {
    const rules = compileConfigFromYaml(CONFIG).ignoreRules
    expect(rules.map(r => [r.path.join(' > '), r.line])).toEqual([
      ['ERROR > FML > used leaf', 6],
      ['ERROR > FML > dead leaf', 7],
      ['ERROR > dead second heading', 9],
      ['WARN > OBJModel.Parser > found a face *', 11],
      ['smoothfont', 12],
      ['plain dead leaf', 13],
    ])
  })

  it('keeps a repeated heading key as two rules pointing at their own lines', () => {
    const rules = compileConfigFromYaml(CONFIG).ignoreRules
    const underError = rules.filter(r => r.path[0] === 'ERROR')
    expect(underError).toHaveLength(3)
    expect(underError.map(r => r.line)).toEqual([6, 7, 9])
  })

  it('gives two identical rules their own lines instead of the same one', () => {
    const rules = compileConfigFromYaml(`
match: ERROR
ignore:
  - A:
      - dup
  - A:
      - dup
replace: []
`).ignoreRules
    expect(rules.map(r => r.line)).toEqual([5, 7])
  })

  it('leaves the line undefined when compiled from an already-parsed object', () => {
    const rules = compileConfig(parseConfig({
      match  : 'ERROR',
      ignore : [{ ERROR: ['no position available'] }],
      replace: [],
    })).ignoreRules
    expect(rules).toHaveLength(1)
    expect(rules[0].line).toBeUndefined()
    expect(rules[0].path).toEqual(['ERROR', 'no position available'])
  })
})

describe('per-rule hit tracking', () => {
  it('counts a hit for the rule that dropped an entry and leaves the rest out', () => {
    const config = compileConfigFromYaml(CONFIG)
    const hits: IgnoreHits = new Map()
    const errors = findErrors(LOG, config, hits)

    expect(errors).toHaveLength(1)
    expect(errors[0].text).toContain('something nobody ignores')

    const used = [...hits].map(([rule, count]) => [rule.path.join(' > '), count])
    expect(used).toEqual([
      ['ERROR > FML > used leaf', 1],
      ['WARN > OBJModel.Parser > found a face *', 1],
    ])
  })

  it('attributes every hit of a repeated pattern to the first matching rule', () => {
    const config = compileConfigFromYaml(`
match: '${MATCH}'
ignore:
  - ERROR:
      - noisy
  - noisy
replace: []
`)
    const hits: IgnoreHits = new Map()
    findErrors(`[15:11:39] [main/ERROR] [FML]: noisy one
[15:11:40] [main/ERROR] [FML]: noisy two
`, config, hits)

    expect([...hits].map(([rule, count]) => [rule.path.join(' > '), count]))
      .toEqual([['ERROR > noisy', 2]])
  })

  it('finds the same errors whether or not a hit map is passed', () => {
    const config = compileConfigFromYaml(CONFIG)
    expect(findErrors(LOG, config)).toEqual(findErrors(LOG, config, new Map()))
  })

  it('records nothing when the compiled config carries no individual rules', () => {
    const config = compileConfigFromYaml(CONFIG)
    const hits: IgnoreHits = new Map()
    // `ignoreFast` still drops entries, but there is no rule to credit.
    findErrors(LOG, { ...config, ignoreRules: [] }, hits)
    expect(hits.size).toBe(0)
  })
})

describe('renderUnusedRules', () => {
  it('lists every never-matched rule with its path and line, then a summary', () => {
    const config = compileConfigFromYaml(CONFIG)
    const hits: IgnoreHits = new Map()
    findErrors(LOG, config, hits)

    expect(renderUnusedRules(config.ignoreRules, hits, 'config.yml')).toBe([
      'config.yml:7 ERROR > FML > dead leaf',
      'config.yml:9 ERROR > dead second heading',
      'config.yml:12 smoothfont',
      'config.yml:13 plain dead leaf',
      '4 of 6 ignore rules never matched',
      '',
    ].join('\n'))
  })

  it('marks the line as `?` when the rule has no known position', () => {
    const config = compileConfig(parseConfig({ match: 'ERROR', ignore: ['nowhere'], replace: [] }))
    expect(renderUnusedRules(config.ignoreRules, new Map(), 'config.yml'))
      .toContain('config.yml:? nowhere')
  })

  it('reports nothing unused when every rule fired', () => {
    const config = compileConfigFromYaml(`
match: '${MATCH}'
ignore:
  - used leaf
replace: []
`)
    const hits: IgnoreHits = new Map()
    findErrors(LOG, config, hits)
    expect(renderUnusedRules(config.ignoreRules, hits, 'config.yml'))
      .toBe('0 of 1 ignore rules never matched\n')
  })
})

describe('--unused end to end', () => {
  it('writes the report to stderr and keeps the exit code', async () => {
    const configPath = join(tmp, 'cfg.yml')
    const logPath = join(tmp, 'debug.log')
    await writeFile(configPath, CONFIG)
    await writeFile(logPath, LOG.repeat(3))

    const stderr: string[] = []
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk))
      return true
    })
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const code = await run({ log: logPath, config: configPath, output: undefined, unused: true })

    errSpy.mockRestore()
    outSpy.mockRestore()

    expect(code).toBe(1)
    expect(stderr.join('')).toBe([
      `${configPath}:7 ERROR > FML > dead leaf`,
      `${configPath}:9 ERROR > dead second heading`,
      `${configPath}:12 smoothfont`,
      `${configPath}:13 plain dead leaf`,
      '4 of 6 ignore rules never matched',
      '',
    ].join('\n'))
  })

  it('stays silent on stderr without the flag', async () => {
    const configPath = join(tmp, 'cfg.yml')
    const logPath = join(tmp, 'debug.log')

    const stderr: string[] = []
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk))
      return true
    })
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await run({ log: logPath, config: configPath, output: undefined })

    errSpy.mockRestore()
    outSpy.mockRestore()
    expect(stderr).toEqual([])
  })

  it('is wired to the `-u` alias on the command line', async () => {
    const configPath = join(tmp, 'cfg.yml')
    const logPath = join(tmp, 'debug.log')
    const previousExitCode = process.exitCode

    const stderr: string[] = []
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk))
      return true
    })
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runCommand(main, { rawArgs: [`--log=${logPath}`, `--config=${configPath}`, '-u'] })

    errSpy.mockRestore()
    outSpy.mockRestore()
    process.exitCode = previousExitCode

    expect(stderr.join('')).toContain('4 of 6 ignore rules never matched')
  })
})
