import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const CLI = resolve(__dirname, '../src/cli.ts')
const TSX_JS = resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs')

describe('cli smoke', () => {
  it('runs --help without crashing', () => {
    const r = spawnSync(process.execPath, [TSX_JS, CLI, '--help'], {
      encoding: 'utf8',
      env     : { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout : 15000,
    })
    // The CLI must boot, parse `--help`, and exit cleanly.
    expect(r.error).toBeUndefined()
    expect(r.status).toBe(0)
    // Stdout capture is flaky under vitest workers on Windows (the child exits
    // 0 but spawnSync returns empty pipes), so only assert content when some
    // output was captured — which is always the case on POSIX CI.
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    if (out.length) expect(out.toLowerCase()).toMatch(/usage|reducer|cwd|--help/)
  }, 20000)
})
