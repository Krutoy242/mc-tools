import { execSync } from 'child_process'
import { expect, test } from 'vitest'

function exec(params: string): string {
  return execSync(
    `esno src/cli.ts --log=test/debug.log ${params}`
  ).toString()
    .trim()
}

test('Run app no arguments', async () => {
  const appResult = exec('').toString()
    .trim()

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

test('Run app with additional filter', async () => {
  const appResult = exec('--blacklist=test/custom_filter.cfg').toString()
    .trim()

  expect(appResult).toMatchInlineSnapshot(`
    "Found 1 errors
    [Client thread\\\\WARN] [smoothfont]: renderChar method might be replaced. Fix the space width to 4 (MC default)."
  `)
})

test('Run app with file output', async () => {
  const appResult = exec('--output=test/output.log').toString()
    .trim()

  expect(appResult).toMatchInlineSnapshot('"Found 6 errors"')
})
