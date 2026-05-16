import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: 'src/extension.ts', name: 'extension' },
  ],
  declaration: true,
  clean      : true,
  rollup     : {
    emitCJS           : false,
    inlineDependencies: true,
  },
  externals: ['vscode'],
})
