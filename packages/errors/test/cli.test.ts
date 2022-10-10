import { execSync } from 'child_process'
import { expect, test } from 'vitest'

test('Cli app work', async () => {
  const appResult = execSync(
    'esno'
    + ' src/cli.ts'
    + ' --log=test/debug.log'
    + ' --blacklist=test/known_errors.csv'
  ).toString()
    .trim()

  expect(appResult).toBe(
`Found 5 errors
[main/ERROR] [mixin]: Mixin config mixins.spectral_edge.json does not specify "minVersion" property
[main/ERROR] [mixin]: Mixin config mixins.spectral_edge.json does not specify "minVersion" property
[Client thread/ERROR] [HadEnoughItems]: Failed to register mod categories: class lykrast.jetif.JETIFPlugin
[Client thread/WARN] [smoothfont]: renderChar method might be replaced. Fix the space width to 4 (MC default).
[Client thread/ERROR] [FML]: Unidentified mapping from registry minecraft:recipes`
  )
})
