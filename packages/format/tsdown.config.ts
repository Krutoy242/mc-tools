import { defineConfig } from 'tsdown'

export default defineConfig({
  entry   : ['src/index.ts', 'src/cli.ts'],
  format  : 'esm',
  dts     : true,
  // The peggy-generated parser is a pre-built artifact copied verbatim to
  // dist by the build script; do not let tsdown try to bundle it.
  external: ['./parser-generated.mjs'],
})
