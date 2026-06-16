import { defineBuildConfig } from 'unbuild'

// `@mctools/utils` is bundled-only (private, never published): inline it into
// dist so the published package is self-contained. The regex also matches its
// subpath exports. `@mctools/curseforge` stays external — it is published.
export default defineBuildConfig({
  declaration: true,
  rollup     : {
    inlineDependencies: [/@mctools\/utils(\/|$)/],
  },
})
