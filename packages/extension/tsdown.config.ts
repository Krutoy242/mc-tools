import { defineConfig } from 'tsdown'

export default defineConfig({
  entry : { extension: 'src/extension.ts' },
  format: 'esm',
  dts   : true,
  deps  : {
    // VS Code extension must be fully self-contained; bundle all deps.
    // 'vscode' stays external (provided by the host at runtime).
    alwaysBundle: [/.*/],
    neverBundle : ['vscode'],
  },
})
