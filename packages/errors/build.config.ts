import { defineBuildConfig } from 'unbuild'

// The CLI entry uses top-level `await`, which Rollup cannot emit into CJS.
// This package is `"type": "module"` and `bin` points to `cli.mjs`, so CJS
// output is never actually consumed — disable it to keep the build green.
//
// For the SEA single-file binary build the deps are inlined separately via
// esbuild — see scripts/build-sea.mjs.
export default defineBuildConfig({
  declaration: true,
  rollup     : {
    emitCJS: false,
  },
})
