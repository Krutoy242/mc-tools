import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// semantic-release runs once per package via `pnpm -r exec`, so cwd is the
// package directory. We compute the monorepo tag format (`@scope/name-vX.Y.Z`)
// explicitly from the package name instead of relying on `extends` alone to
// inject it — in CI that fell back to the default `v${version}` format, which
// collapsed all packages onto one shared release.
const { name } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  extends  : 'semantic-release-monorepo',
  branches : ['master'],
  tagFormat: `${name}-v\${version}`,
  plugins  : [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    // `@semantic-release/npm` only verifies auth and writes the next version
    // into package.json — it does NOT publish, because it shells out to
    // `npm publish`, which cannot resolve pnpm's `workspace:*` protocol.
    ['@semantic-release/npm', { npmPublish: false }],
    // `pnpm publish` rewrites `workspace:*` specifiers to real versions before
    // uploading, so it is the only thing that can publish from this workspace.
    ['@semantic-release/exec', { publishCmd: 'pnpm publish --no-git-checks --access public' }],
    '@semantic-release/github',
  ],
}
