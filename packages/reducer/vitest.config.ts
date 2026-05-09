import { defineConfig } from 'vitest/config'

export default defineConfig({
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
