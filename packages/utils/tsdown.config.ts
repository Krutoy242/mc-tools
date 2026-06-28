import { defineConfig } from 'tsdown'

// File-to-file transpile (replaces unbuild mkdist): each source module maps
// 1:1 to a dist file so each subpath export stays individually importable.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/natural-sort.ts',
    'src/args.ts',
    'src/lang.ts',
    'src/mods/ftbquests.ts',
    'src/mods/tellme.ts',
    'src/mods/resolve.ts',
  ],
  unbundle: true,
  dts     : true,
})
