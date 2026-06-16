import { defineBuildConfig } from 'unbuild'

// `@mctools/utils` is bundled-only (private, never published): inline it into
// dist so the published package is self-contained. The regex also matches its
// subpath exports (e.g. `@mctools/utils/tellme`).
export default defineBuildConfig({
  declaration: true,
  rollup     : {
    inlineDependencies: [/@mctools\/utils(\/|$)/],
  },
})
