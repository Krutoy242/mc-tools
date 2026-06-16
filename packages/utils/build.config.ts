// Unlike every other package (which bundles with `unbuild`/Rollup), `@mctools/utils`
// uses `mkdist` for a *file-to-file* transpile: each source module maps 1:1 to a
// dist file. That keeps its many subpath exports (`./args`, `./lang`, `./tellme`, …)
// individually importable, and — since this package is bundled-only (private,
// never published) — lets consumers tree-shake/inline exactly the files they use.
export default {
  entries: [
    { builder: 'mkdist', format: 'cjs', input: './src' },
    { builder: 'mkdist', input: './src' },
  ],
  declaration: true,
}
