import { readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { runCommand } from 'citty'

import { expect, it, vi } from 'vitest'

import { main } from '../src/cli.js'

it('run app no arguments', async () => {
  await expect(runCommand(main, { rawArgs: [] })).rejects.toThrow()
})

// SKIPPED: this integration test reads `test/stats/Traits.csv` as an input
// fixture, but that file was never committed to the repo — and the test's own
// `rmSync('test/stats', …)` below deletes the directory, so it only ever passed
// on a machine that had the file locally. The inline snapshot is also stale
// (the CLI now emits a 3-step `[1/3]…[3/3]` progress, not 2). To re-enable:
// commit a `test/stats/Traits.csv` fixture, stop deleting it, and refresh the
// snapshot.
it.skip('run app with all args', async () => {
  const chunks: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })

  await runCommand(main, {
    rawArgs: '--default=test/def_tweakersconstruct.cfg --tweaks=test --mc=test --save=test/stats'.split(' '),
  })

  spy.mockRestore()

  const stdout = chunks.join('')
  expect(stdout).toMatchInlineSnapshot(`
    "[1/2] Loading configs
    [2/2] Applying tweaks..done"
  `)

  for (const f of ['Armory Stats.csv', 'Stats.csv']) {
    expect(readFileSync(resolve('test/stats', f), 'utf8'))
      .toEqual(readFileSync(resolve('test/ethalon', f), 'utf8'))
  }
  rmSync('test/stats', { recursive: true, force: true })
})
