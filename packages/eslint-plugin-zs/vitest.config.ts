import { defineConfig } from 'vitest/config'
import { mctoolsAlias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias: mctoolsAlias },
  test   : {
    coverage: {
      provider: 'v8',
      include : ['src/**/*.ts'],
    },
  },
})
