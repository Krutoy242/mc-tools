import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { mctoolsAlias } from '../../vitest.shared'

// `vscode` only exists inside the extension host, so tests resolve it to an
// in-memory stub. Keep it last so it never shadows a @mctools/* specifier.
const vscodeStub = fileURLToPath(new URL('./test/stubs/vscode.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      ...mctoolsAlias,
      { find: /^vscode$/, replacement: vscodeStub },
    ],
  },
})
