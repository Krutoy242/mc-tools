import { defineConfig } from 'vitest/config'
import { mctoolsAlias } from '../../vitest.shared'

export default defineConfig({
  resolve: { alias: mctoolsAlias },
  esbuild: {
    jsx            : 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    coverage: {
      provider: 'v8',
      include : ['src/**/*.{ts,tsx}'],
      exclude : ['src/cli.ts', 'src/index.ts', 'src/**/*.d.ts'],
    },
  },
})
