import { defineConfig } from 'tsdown'

export default defineConfig({
  entry : ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  dts   : true,
  deps  : {
    // @mctools/utils is private/bundled-only; inline it so the published
    // package is self-contained. Regex also matches subpath exports.
    alwaysBundle: [/@mctools\/utils/],
  },
})
