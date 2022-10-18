import { execSync } from 'child_process'
import { readFileSync, rmSync } from 'fs'
import { resolve } from 'path'
import { expect, test } from 'vitest'

function exec(params: string) {
  return execSync(
    `esno src/cli.ts ${params}`
  ).toString().trim()
}

test('Run app no arguments', async () => {
  expect(() => exec('')).toThrowError()
})

test('Run app with all args', async () => {
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
