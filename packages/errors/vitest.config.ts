import { defineConfig } from 'vitest/config'
import { mctoolsAlias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias: mctoolsAlias },
  test   : {
    coverage: {
      provider  : 'v8',
      include   : ['src/**/*.ts'],
      // cli.ts is citty + runMain glue — only meaningfully testable through a
      // subprocess (covered by the smoke test). build-sea.mjs is a build
      // artifact, not runtime code.
      exclude   : ['src/cli.ts', 'scripts/**'],
      thresholds: {
        statements: 100,
        branches  : 100,
        functions : 100,
        lines     : 100,
      },
    },
  },
})
