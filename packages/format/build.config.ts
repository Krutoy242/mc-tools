import { defineBuildConfig } from 'unbuild'

// Mirrors the sibling `@mctools/errors` package: ESM-only output. CJS is not
// used (`"type": "module"` and bin → cli.mjs) and Rollup occasionally trips
// over peggy's generated module format when emitting CJS.
export default defineBuildConfig({
  declaration: true,
  failOnWarn : false,
  rollup     : {
    emitCJS           : false,
    inlineDependencies: false,
  },
  // The precompiled parser is copied verbatim into dist by the `build`
  // script; do not let unbuild try to bundle or rewrite it.
  externals: ['./parser-generated.mjs'],
})
