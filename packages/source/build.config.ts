import { defineBuildConfig } from 'unbuild'

// `@mctools/curseforge` stays external — it is published separately.
export default defineBuildConfig({
  declaration: true,
})
