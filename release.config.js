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
    '@semantic-release/npm',
    '@semantic-release/github',
  ],
}
