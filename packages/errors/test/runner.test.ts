import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CONFIG,
  loadConfig,
  loadLog,
  run,
  tryLoadSeaAsset,
  writeOutput,
} from '../src/runner.js'

let tmp: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'mct-errors-'))
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

function silenceStdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

describe('loadConfig', () => {
  it('loads and compiles the default config from disk', async () => {
    const cfg = await loadConfig(DEFAULT_CONFIG, true)
    expect(cfg.match).toBeInstanceOf(RegExp)
  })

  it('throws when a user-specified config file is missing', async () => {
    await expect(loadConfig(join(tmp, 'no-such.yml'), false))
      .rejects
      .toThrow(/Config file not found/)
  })

  it('throws when the default path is missing and no SEA asset exists', async () => {
    // Not in a SEA build, so the asset fallback will return null.
    await expect(loadConfig(join(tmp, 'no-such.yml'), true))
      .rejects
      .toThrow(/Config file not found/)
  })

  it('reads a user-specified valid YAML config', async () => {
    const path = join(tmp, 'cfg.yml')
    await writeFile(path, 'match: ERROR\nignore: ""\nreplace: []\n')
    const cfg = await loadConfig(path, false)
    expect(cfg.ignoreFast).toBeNull()
  })
})

describe('loadLog', () => {
  it('reads a log file', async () => {
    const path = join(tmp, 'good.log')
    await writeFile(path, 'x'.repeat(200))
    expect((await loadLog(path)).length).toBe(200)
  })

  it('throws when the log file does not exist', async () => {
    await expect(loadLog(join(tmp, 'missing.log')))
      .rejects
      .toThrow(/doesnt exist/)
  })

  it('throws when the log file is suspiciously short', async () => {
    const path = join(tmp, 'short.log')
    await writeFile(path, 'too short')
    await expect(loadLog(path)).rejects.toThrow(/too short/)
  })
})

describe('writeOutput', () => {
  it('writes to a file (creating parent directories) when output is given', async () => {
    const out = join(tmp, 'nested/out.log')
    const spy = silenceStdout()
    await writeOutput([
      { text: 'first', line: 1 },
      { text: 'second', line: 5 },
    ], out, false)
    spy.mockRestore()
    expect(await readFile(out, 'utf8')).toBe('first\nsecond')
  })

  it('writes to stdout when output is undefined', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
    await writeOutput([{ text: 'hello', line: 1 }], undefined, false)
    spy.mockRestore()
    expect(writes.some(w => w.startsWith('Found 1 errors'))).toBe(true)
    expect(writes.some(w => w.includes('hello'))).toBe(true)
  })

  it('does not announce "Found N errors" when there are no errors', async () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
    await writeOutput([], undefined, false)
    spy.mockRestore()
    expect(writes.some(w => /Found \d+ errors/.test(w))).toBe(false)
  })

  it('writes to stdout with ANSI escapes when TTY', async () => {
    const oldColor = process.env.FORCE_COLOR
    process.env.FORCE_COLOR = '1'
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    })
    await writeOutput([{ text: '[main/ERROR] [FML]: foo', line: 1, time: '15:11:39' }], undefined, true)
    spy.mockRestore()

    if (oldColor === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = oldColor

    const out = writes.join('')
    expect(out).toContain('\x1B[31mERROR\x1B[39m') // red
  })

  it('writes mermaid markdown when .md output is given', async () => {
    const out = join(tmp, 'out.md')
    const spy = silenceStdout()
    await writeOutput([
      { text: '[main/ERROR] [FML]: foo', line: 1, time: '15:11:39' },
    ], out, false)
    spy.mockRestore()

    const content = await readFile(out, 'utf8')
    expect(content).toContain('# Errors report')
    expect(content).toContain('```mermaid')
  })
})

describe('run (integration)', () => {
  it('returns 1 when errors are found', async () => {
    const spy = silenceStdout()
    const code = await run({
      log   : 'test/debug.log',
      config: 'src/config.yml',
      output: undefined,
    })
    spy.mockRestore()
    expect(code).toBe(1)
  })

  it('returns 0 when no errors are found', async () => {
    const cfg = join(tmp, 'never.yml')
    await writeFile(cfg, 'match: DEFINITELY_NEVER_MATCHES_XYZ\nignore: ""\nreplace: []\n')
    const spy = silenceStdout()
    const code = await run({
      log   : 'test/debug.log',
      config: cfg,
      output: undefined,
    })
    spy.mockRestore()
    expect(code).toBe(0)
  })

  it('uses isDefault path when args.config equals DEFAULT_CONFIG', async () => {
    const spy = silenceStdout()
    const code = await run({
      log   : 'test/debug.log',
      config: DEFAULT_CONFIG,
      output: undefined,
    })
    spy.mockRestore()
    expect(code).toBe(1)
  })
})

describe('tryLoadSeaAsset', () => {
  it('returns null when not running in a SEA binary', async () => {
    expect(await tryLoadSeaAsset('config.yml')).toBeNull()
  })
})

describe('sEA-asset fallback (mocked node:sea)', () => {
  it('loadConfig uses the SEA asset when the default config file is missing', async () => {
    vi.resetModules()
    vi.doMock('node:sea', () => ({
      isSea   : () => true,
      getAsset: () => new TextEncoder().encode('match: "ERROR"\nignore: ""\nreplace: []\n'),
    }))
    const fresh = await import('../src/runner.js')
    const cfg = await fresh.loadConfig(join(tmp, 'no-such.yml'), true)
    expect(cfg.match).toBeInstanceOf(RegExp)
    vi.doUnmock('node:sea')
    vi.resetModules()
  })
})
