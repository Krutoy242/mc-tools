import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

import { wrapStep } from 'semantic-release-plugin-decorators'

// semantic-release runs once per package via `pnpm -r exec`, so cwd is the
// package directory.
const loadJson = p => JSON.parse(readFileSync(p, 'utf8'))
const { name } = loadJson(resolve(process.cwd(), 'package.json'))

// ---------------------------------------------------------------------------
// Dependency-aware monorepo filtering.
//
// `semantic-release-monorepo` only counts commits touching a package's OWN
// folder — it has no idea about workspace dependencies. But our packages bundle
// `@mctools/utils` and depend on each other via `workspace:*`, so a change in a
// dependency must republish its dependents (otherwise they ship stale code).
//
// We therefore reuse `wrapStep` (the same decorator `semantic-release-monorepo`
// is built on — it resolves the real plugin from the `plugins` array and runs
// it) but swap the commit filter for one that matches the package's own folder
// OR any of its transitive `workspace:` dependency folders.
//
// NB: this is wired explicitly rather than via `extends: 'semantic-release-
// monorepo'` because semantic-release does NOT resolve `extends` recursively —
// our `.releaserc.json` → `release.config.js` chain already consumes the single
// allowed level, so a nested `extends` here is silently ignored.
// ---------------------------------------------------------------------------

const toPosix = p => p.split(/[/\\]/).join('/')

const gitRoot = () => execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()

/** Files changed by a single commit, as posix paths relative to the git root. */
const commitFilesCache = new Map()
function getCommitFiles(hash) {
  if (!commitFilesCache.has(hash)) {
    const out = execFileSync('git', ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', hash], { encoding: 'utf8' })
    commitFilesCache.set(hash, out.split('\n').filter(Boolean).map(toPosix))
  }
  return commitFilesCache.get(hash)
}

/** Workspace package name -> absolute folder, scanned from `<root>/packages/*`. */
function scanWorkspace(packagesDir) {
  const byName = new Map()
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    try {
      const pkg = loadJson(join(dir, 'package.json'))
      if (pkg.name) byName.set(pkg.name, dir)
    }
    catch {
      // folder without a readable package.json — skip
    }
  }
  return byName
}

/** Every `workspace:`-protocol dependency name across all dependency fields. */
function workspaceDepNames(pkg) {
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
  const names = []
  for (const field of fields) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) names.push(dep)
    }
  }
  return names
}

/**
 * Folders (posix, relative to git root) whose changes should release this
 * package: its own folder plus every transitive workspace dependency.
 * Memoised — identical for every commit and every lifecycle step.
 */
let relevantPathsCache
function relevantPaths() {
  if (relevantPathsCache) return relevantPathsCache

  const root = gitRoot()
  const byName = scanWorkspace(join(root, 'packages'))

  const ownDir = process.cwd()
  const dirs = new Set([ownDir])
  const seen = new Set([name])
  const queue = [loadJson(join(ownDir, 'package.json'))]

  while (queue.length) {
    const pkg = queue.shift()
    for (const dep of workspaceDepNames(pkg)) {
      if (seen.has(dep)) continue
      seen.add(dep)
      const depDir = byName.get(dep)
      if (!depDir) continue
      dirs.add(depDir)
      try {
        queue.push(loadJson(join(depDir, 'package.json')))
      }
      catch {
        // unreadable dependency package.json — still match by folder
      }
    }
  }

  relevantPathsCache = [...dirs].map(dir => toPosix(relative(root, dir)))
  return relevantPathsCache
}

/** True when `file` lives under any of the relevant package folders. */
function isRelevant(file) {
  const fileSegs = file.split('/')
  return relevantPaths().some((pkgPath) => {
    const pkgSegs = pkgPath.split('/')
    return pkgSegs.every((seg, i) => seg === fileSegs[i])
  })
}

/** Wrap a step so it only sees commits touching this package or its deps. */
function withRelevantCommits(step) {
  return async (pluginConfig, context) => {
    const commits = context.commits.filter(commit =>
      getCommitFiles(commit.hash).some(isRelevant)
    )
    context.logger.log(
      'Found %s relevant commits for package %s since last release',
      commits.length,
      name
    )
    return step(pluginConfig, { ...context, commits })
  }
}

/**
 * Wrap a step so `nextRelease.version` is the monorepo git tag, not the bare
 * version — keeps release notes and GitHub comments scoped to this package.
 */
function withTaggedVersion(step) {
  return async (pluginConfig, context) => {
    const { version } = context.nextRelease ?? {}
    const next = version
      ? { ...context, nextRelease: { ...context.nextRelease, version: `${name}-v${version}` } }
      : context
    return step(pluginConfig, next)
  }
}

const wrapperName = 'monorepo-dep-aware'

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches      : ['master'],
  tagFormat     : `${name}-v\${version}`,
  // These override the per-step plugin derivation from `plugins` below, running
  // the same plugins through our dependency-aware commit filter.
  analyzeCommits: wrapStep('analyzeCommits', withRelevantCommits, { wrapperName }),
  generateNotes : wrapStep('generateNotes', step => withRelevantCommits(withTaggedVersion(step)), { wrapperName }),
  success       : wrapStep('success', step => withRelevantCommits(withTaggedVersion(step)), { wrapperName }),
  fail          : wrapStep('fail', step => withRelevantCommits(withTaggedVersion(step)), { wrapperName }),
  plugins       : [
    // `wrapStep` resolves and runs these real plugins; they must stay listed.
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
