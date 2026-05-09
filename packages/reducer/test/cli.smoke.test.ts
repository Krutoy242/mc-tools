import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const CLI = resolve(__dirname, '../src/cli.ts')
const TSX_JS = resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs')

// FIXME: spawn produces empty output under vitest on Windows even though
// running the CLI directly works fine. Skipped until investigated.
describe.skip('cli smoke', () => {
  it('prints help with --help', () => {
    const r = spawnSync(process.execPath, [TSX_JS, CLI, '--help'], {
      encoding: 'utf8',
      env     : { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout : 8000,
    })
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    if (!out.length) {
      // Surface diagnostics so a failure here points at the spawn, not the CLI.
      throw new Error(`empty output. status=${r.status} signal=${r.signal} error=${r.error?.message ?? 'none'}`)
    }
    expect(out.toLowerCase()).toMatch(/usage|reducer|cwd|--help/)
  })
})
