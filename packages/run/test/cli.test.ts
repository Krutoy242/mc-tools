import { execSync } from 'node:child_process'

import { expect, it } from 'vitest'

it('run app without arguments', async () => {
  expect(() => execSync('tsx src/cli.ts'))
    .toThrowError(Error)
})

it('run app', async () => {
  expect(execSync('tsx src/cli.ts test/mct-run.json').toString().trim())
    .toMatchInlineSnapshot('"[1GHelloWorld: Hello World!"')
})
