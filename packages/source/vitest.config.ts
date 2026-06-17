import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include : ['src/**/*.ts'],
      exclude : ['src/cli.ts', 'src/index.ts', 'src/**/*.d.ts'],
    },
  },
})
