import { execSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('Run app without arguments', async () => {
  expect(() => execSync('esno src/cli.ts'))
    .toThrowError(Error)
})

test('Run app', async () => {
  expect(execSync('esno src/cli.ts test/mct-run.json').toString().trim())
    .toMatchInlineSnapshot('"[1GHelloWorld: Hello World!"')
})
