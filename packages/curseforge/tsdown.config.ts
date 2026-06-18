import { defineConfig } from 'tsdown'

export default defineConfig({
  entry : ['src/index.ts', 'src/minecraftinstance.ts'],
  format: 'esm',
  dts   : true,
})
