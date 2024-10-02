import { execSync } from 'node:child_process'

import { expect, it } from 'vitest'

import { getFetchInModsDir } from '../src/index'

function exec(params: string) {
  return execSync(
    `tsx src/cli.ts ${params}`
  ).toString().trim()
}

it('run app no arguments', async () => {
  expect(() => exec('')).toThrowError()
})

it('disable and enable some jars', async () => {
  expect(exec(
    '--levels=test/reduce_mods.json'
    + ' --mods=test/mods'
    + ' --index=1'
  )).toMatchInlineSnapshot('""')

  const fetchMods = getFetchInModsDir('test/mods')
  expect(fetchMods('*').join('\n')).toMatchInlineSnapshot(`
    "betteranimals-1.12.2-5.5.0.jar.disabled
    OptiFine_1.12.2_HD_U_G5.jar
    Sound-Physics-1.12.2-1.0.10-1.jar.disabled
    [___MixinCompat-0.8___].jar"
  `)

  expect(exec(
    '--levels=test/reduce_mods.json'
    + ' --mods=test/mods'
    + ' --index=0'
  )).toMatchInlineSnapshot(`
    "Enabling Mods    /                            Enabling Mods   [] [1/2] betteranimals-1.12.…

    Enabling Mods   [] [2/2] Sound-Physics-1.12.…"
  `)

  expect(fetchMods('*').join('\n')).toMatchInlineSnapshot(`
    "betteranimals-1.12.2-5.5.0.jar
    OptiFine_1.12.2_HD_U_G5.jar
    Sound-Physics-1.12.2-1.0.10-1.jar
    [___MixinCompat-0.8___].jar"
  `)
})
