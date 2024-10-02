import { execSync } from 'node:child_process'

import { expect, it } from 'vitest'

function exec(params: string): string {
  return execSync(
    `tsx src/cli.ts --log=test/debug.log ${params}`
  ).toString()
    .trim()
}

it('run app no arguments', async () => {
  const appResult = exec('')

  expect(appResult).toMatchInlineSnapshot(`
    "Found 6 errors
    [main\\\\ERROR] [FML]: Coremod EyeOfDragonsPlugin: Unable to class load the plugin de.curlybracket.eyeofdragons.EyeOfDragonsPlugin
    [main\\\\ERROR] [mixin]: Mixin config mixins.spectral_edge.json does not specify \\"minVersion\\" property
    [main\\\\ERROR] [mixin]: Mixin config mixins.spectral_edge.json does not specify \\"minVersion\\" property
    [Client thread\\\\ERROR] [HadEnoughItems]: Failed to register mod categories: class lykrast.jetif.JETIFPlugin
    [Client thread\\\\WARN] [smoothfont]: renderChar method might be replaced. Fix the space width to 4 (MC default).
    [Client thread\\\\ERROR] [FML]: Unidentified mapping from registry minecraft:recipes"
  `)
})

it('run app with additional filter', async () => {
  const appResult = exec('--blacklist=test/custom_filter.cfg')

  expect(appResult).toMatchInlineSnapshot(`
    "Found 1 errors
    [Client thread\\\\WARN] [smoothfont]: renderChar method might be replaced. Fix the space width to 4 (MC default)."
  `)
})

it('run app with file output', async () => {
  const appResult = exec('--output=test/output.log')

  expect(appResult).toMatchInlineSnapshot('"Found 6 errors"')
})
