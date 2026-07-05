import { defineConfig } from 'vitest/config'
import { mctoolsAlias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias: mctoolsAlias },
  test   : {
    exclude : ['test/find.test.ts'],
    coverage: {
      provider: 'v8',
      include : ['src/**/*.ts'],
      exclude : ['src/cli.ts', 'src/index.ts', 'src/**/*.d.ts'],
    },
  },
})
