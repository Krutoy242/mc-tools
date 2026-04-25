#!/usr/bin/env node
// Build a single-file binary using Node SEA (Single Executable Applications).
// Requires Node >= 24. Produces dist/mct-errors[.exe].
//
// Steps:
//   1. Build dist/ via unbuild.
//   2. Bundle dist/cli.mjs into a self-contained dist/cli.bundle.mjs (esbuild)
//      so SEA has a single JS file with all deps inlined.
//   3. Generate the SEA blob from the bundle.
//   4. Copy the running node binary to dist/.
//   5. (macOS) Strip the existing code signature.
//   6. Inject the blob into the binary using `postject`.
//   7. (macOS) Re-sign ad-hoc.

import { execSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { build as esbuild } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const distDir = join(pkgDir, 'dist')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'
const target = join(distDir, isWin ? 'mct-errors.exe' : 'mct-errors')
const seaConfig = join(here, 'sea-config.json')

function step(msg) {
  process.stdout.write(`\n→ ${msg}\n`)
}

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: pkgDir, ...opts })
}

step('Building dist/')
sh('pnpm run build')

if (!existsSync(join(distDir, 'cli.mjs')))
  throw new Error('dist/cli.mjs missing after build')

step('Bundling dist/cli.bundle.cjs (esbuild → CJS for SEA code-cache compatibility)')
await esbuild({
  entryPoints: [join(distDir, 'cli.mjs')],
  outfile    : join(distDir, 'cli.bundle.cjs'),
  bundle     : true,
  platform   : 'node',
  format     : 'cjs',
  target     : 'node24',
  minify     : true,
})

step('Generating SEA blob')
sh(`node --experimental-sea-config ${JSON.stringify(seaConfig)}`)

step(`Copying node binary → ${target}`)
copyFileSync(process.execPath, target)
if (!isWin) chmodSync(target, 0o755)

if (isMac) {
  step('Stripping macOS signature')
  sh(`codesign --remove-signature ${JSON.stringify(target)}`)
}

step('Injecting blob via postject')
const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const blob = join(distDir, 'sea-prep.blob')
const postjectArgs = [
  'postject',
  target,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  sentinel,
]
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA')
sh(`npx --yes ${postjectArgs.map(a => JSON.stringify(a)).join(' ')}`)

if (isMac) {
  step('Re-signing macOS binary (ad-hoc)')
  sh(`codesign --sign - ${JSON.stringify(target)}`)
}

step(`Done: ${target}`)
