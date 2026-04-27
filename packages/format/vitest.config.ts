import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include : ['src/**/*.ts'],
      // - cli.ts: citty + runMain glue, exercised by the smoke test.
      // - parser-generated.mjs: auto-generated artifact.
      exclude : ['src/cli.ts', 'src/parser-generated.mjs', 'scripts/**'],
    },
  },
})
