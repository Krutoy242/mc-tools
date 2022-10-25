import { execSync } from 'child_process'
import { expect, test } from 'vitest'

test('Run app without arguments', async () => {
  expect(() => execSync('esno src/cli.ts'))
    .toThrowError(Error)
})
