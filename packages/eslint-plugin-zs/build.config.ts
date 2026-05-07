import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  failOnWarn : false,
  rollup     : {
    emitCJS           : false,
    inlineDependencies: false,
  },
})
