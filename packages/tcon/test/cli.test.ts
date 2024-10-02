import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, it } from 'vitest'

function exec(params: string) {
  return execSync(
    `tsx src/cli.ts ${params}`
  ).toString().trim()
}

it('run app no arguments', async () => {
  expect(() => exec('')).toThrowError()
})

it('run app with all args', async () => {
  expect(exec(
    '--default=test/def_tweakersconstruct.cfg'
    + ' --tweaks=test'
    + ' --mc=test'
    + ' --save=test/stats'
  )).toMatchInlineSnapshot(`
    "[1/2] Loading configs
    [2/2] Applying tweaks..done"
  `)

  for (const f of ['Armory Stats.csv', 'Stats.csv']) {
    expect(readFileSync(resolve('test/stats', f), 'utf8'))
      .toEqual(readFileSync(resolve('test/ethalon', f), 'utf8'))
  }
  rmSync('test/stats', { recursive: true, force: true })
})
