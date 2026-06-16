// Shared semantic-release config, picked up by each publishable package via
// cosmiconfig when `pnpm -r ... exec -- semantic-release` runs from the package
// directory (see the `release:all` script). `semantic-release-monorepo` scopes
// commit analysis and git tags to each package's own path.
//
// `@mctools/utils` (bundled-only) and `@mctools/extension` (ships via vsce) are
// excluded from the release loop in `release:all`, so they never run this.
/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  extends : 'semantic-release-monorepo',
  branches: ['master'],
  plugins : [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    // `@semantic-release/npm` only verifies auth and writes the next version
    // into package.json — it does NOT publish, because it shells out to
    // `npm publish`, which cannot resolve pnpm's `workspace:*` protocol.
    ['@semantic-release/npm', { npmPublish: false }],
    // `pnpm publish` rewrites `workspace:*` specifiers to real versions before
    // uploading, so it is the only thing that can publish from this workspace.
    // semantic-release runs each plugin in the package's own dir (pnpm -r exec),
    // so this publishes the current package.
    ['@semantic-release/exec', { publishCmd: 'pnpm publish --no-git-checks --access public' }],
    '@semantic-release/github',
  ],
}
