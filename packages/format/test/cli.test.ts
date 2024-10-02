import { execSync } from 'node:child_process'

import { expect, it } from 'vitest'

it('run app without arguments', async () => {
  expect(() => execSync('tsx src/cli.ts'))
    .toThrowError(Error)
})
