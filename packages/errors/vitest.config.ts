import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
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
