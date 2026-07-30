import type { Logger } from './types.js'
import type { SourceVersion } from './version.js'
import child_process from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { glob } from 'tinyglobby'
import { normalizeVersion, readSourceVersion, VERSION_FILES, versionFromFile } from './version.js'

export const execAsync = promisify(child_process.exec)

/** A source folder is "real" only if it carries a meaningful amount of Java. */
const MIN_JAVA_FILES = 3

/**
 * A folder counts as valid mod source if it is a directory holding at least
 * {@link MIN_JAVA_FILES} `.java` files.
 */
export async function verifySourceFolder(dir: string, log: Logger): Promise<boolean> {
  try {
    const javaFiles = await glob('**/*.java', { cwd: dir })
    if (javaFiles.length >= MIN_JAVA_FILES) return true
    log(chalk.yellow(`Folder ${dir} found but contains only ${javaFiles.length} .java files (requires >= ${MIN_JAVA_FILES}).`))
    return false
  }
  catch {
    return false
  }
}

export async function getLatestCommitDate(dir: string): Promise<Date | null> {
  try {
    const { stdout } = await execAsync(`git -C "${dir}" log -1 --format=%ct`)
    const timestamp = Number.parseInt(stdout.trim(), 10)
    return Number.isNaN(timestamp) ? null : new Date(timestamp * 1000)
  }
  catch {
    return null
  }
}

/** Name of the checked-out branch, or `''` when HEAD is detached. */
async function currentBranchName(dir: string): Promise<string> {
  const { stdout } = await execAsync(`git -C "${dir}" branch --show-current`)
  return stdout.trim()
}

/** Pick the best `1.12.x` remote branch of a repo, preferring exact `1.12.2`. */
async function pick112Branch(repoUrl: string): Promise<string | undefined> {
  const { stdout } = await execAsync(`git ls-remote --heads "${repoUrl}"`)
  const branches = stdout.split('\n')
    .map(line => line.match(/refs\/heads\/(.*)/)?.[1]?.trim())
    .filter((b): b is string => Boolean(b))
  return branches.find(b => /1\.12\.2/.test(b)) ?? branches.find(b => /1\.12/.test(b))
}

/**
 * Shallow-clone `repoUrl` into `targetDir`, preferring a `1.12.x` branch.
 * No-op (returns `true`) if `targetDir` already exists. This is the single
 * clone implementation reused by every repo-resolution strategy.
 */
export async function cloneRepo(repoUrl: string, targetDir: string, log: Logger): Promise<boolean> {
  if (existsSync(targetDir)) {
    log(chalk.gray(`Directory ${targetDir} already exists, skipping clone.`))
    return true
  }

  const branch = await pick112Branch(repoUrl).catch(() => undefined)
  log(chalk.blue(`Cloning ${repoUrl}... `), false)
  if (branch) log(chalk.green(`found ${branch}. `), false)
  else log(chalk.yellow('no 1.12.x branch found, cloning default... '), false)

  const cmd = branch
    ? `git clone --depth 1 -b "${branch}" "${repoUrl}" "${targetDir}"`
    : `git clone --depth 1 "${repoUrl}" "${targetDir}"`
  await execAsync(cmd)
  log(chalk.green('Done.'))
  return true
}

/**
 * Ensure a local source folder is checked out on a `1.12.x` branch. Stashes
 * uncommitted changes and creates a tracking branch if needed. Returns `true`
 * if the folder is usable (already 1.12, switched successfully, or no 1.12
 * branch exists so the current one is kept).
 */
export async function ensureCorrectBranch(dir: string, log: Logger): Promise<boolean> {
  try {
    const currentBranch = await currentBranchName(dir)
    if (/1\.12/.test(currentBranch)) return true

    log(chalk.cyan(`Current branch '${currentBranch}' is not 1.12.x. Looking for a suitable branch...`))

    // Newest first, so an abandoned `1.12.2` never wins over a live `1.12.2-Latest`.
    const { stdout: remoteOut } = await execAsync(
      `git -C "${dir}" for-each-ref --sort=-committerdate --format=%(refname:short) refs/remotes/origin`
    )
    const remotes = remoteOut.split('\n').map(b => b.trim()).filter(Boolean)
    const candidates12 = remotes.filter(b => /1\.12/.test(b))
    if (candidates12.length === 0) {
      log(chalk.yellow('No 1.12.x remote branch found, staying on current branch.'))
      return true
    }

    const targetRemote = candidates12.find(b => /1\.12\.2/.test(b)) || candidates12[0]
    const localName = targetRemote.replace(/^origin\//, '')

    const { stdout: statusOut } = await execAsync(`git -C "${dir}" status --porcelain`)
    if (statusOut.trim()) {
      log(chalk.gray('Uncommitted changes detected, stashing...'), false)
      await execAsync(`git -C "${dir}" stash push -m "mctools-source-auto-stash"`)
      log(chalk.green('stashed.'))
    }

    try {
      await execAsync(`git -C "${dir}" show-ref --verify --quiet refs/heads/${localName}`)
      await execAsync(`git -C "${dir}" checkout "${localName}"`)
    }
    catch {
      await execAsync(`git -C "${dir}" checkout -b "${localName}" --track "${targetRemote}"`)
    }

    log(chalk.green(`Switched to branch '${localName}'.`))
    return true
  }
  catch (e) {
    log(chalk.red(`Failed to ensure correct branch: ${e instanceof Error ? e.message : String(e)}`))
    return false
  }
}

/** How many commits of a version file are inspected when hunting a version. */
const MAX_HISTORY_SCAN = 120

/** Parallelism for the `git show` calls of the history scan. */
const SCAN_CONCURRENCY = 8

async function isGitRepo(dir: string): Promise<boolean> {
  return execAsync(`git -C "${dir}" rev-parse --git-dir`).then(() => true, () => false)
}

/** Stash uncommitted work so checkouts and pulls cannot fail on dirt. */
async function stashDirty(dir: string, log: Logger): Promise<void> {
  const { stdout } = await execAsync(`git -C "${dir}" status --porcelain`)
  if (!stdout.trim()) return
  await execAsync(`git -C "${dir}" stash push -m "mctools-source-auto-stash"`)
  log(chalk.gray('Uncommitted changes stashed.'))
}

/**
 * Bring the repo's objects up to date: unshallow if needed (older commits are
 * required to check out an older release) and fetch every branch and tag.
 */
async function fetchRepo(dir: string, log: Logger): Promise<void> {
  const shallow = await execAsync(`git -C "${dir}" rev-parse --is-shallow-repository`)
    .then(r => r.stdout.trim() === 'true', () => false)
  try {
    await execAsync(`git -C "${dir}" fetch --tags --force ${shallow ? '--unshallow' : ''} origin`)
  }
  catch (e) {
    log(chalk.yellow(`Fetch failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`))
  }
}

/** Fast-forward the current branch onto its upstream, if it has one. */
async function pullCurrentBranch(dir: string): Promise<void> {
  await execAsync(`git -C "${dir}" merge --ff-only @{u}`).catch(() => {})
}

/** Repo-local git config key remembering the branch version pins detach from. */
const BRANCH_KEY = 'mctools.sourceBranch'

/**
 * Put the repo back on a usable 1.12.x branch. Pinning to an installed version
 * leaves HEAD detached, so the branch that pin came from is remembered in the
 * repo's own config and restored here — otherwise every rerun would re-guess
 * the branch and could drift onto an abandoned one.
 */
async function restoreWorkingBranch(dir: string, log: Logger): Promise<boolean> {
  if (!await currentBranchName(dir)) {
    const saved = await execAsync(`git -C "${dir}" config --get ${BRANCH_KEY}`)
      .then(r => r.stdout.trim(), () => '')
    if (saved && await execAsync(`git -C "${dir}" checkout "${saved}"`).then(() => true, () => false)) {
      log(chalk.gray(`Returned to branch '${saved}'.`))
      return true
    }
  }

  if (!await ensureCorrectBranch(dir, log)) return false

  const branch = await currentBranchName(dir)
  if (branch) await execAsync(`git -C "${dir}" config ${BRANCH_KEY} "${branch}"`).catch(() => {})
  return true
}

/**
 * Find a tag naming one of `versions`. Matching is token-based so
 * `v1.10.203`, `1.12.2-1.10.203` and `release-1.10.203` all match `1.10.203`.
 */
async function findVersionTag(dir: string, versions: string[]): Promise<string | null> {
  const { stdout } = await execAsync(`git -C "${dir}" tag --list`).catch(() => ({ stdout: '' }))
  const tags = stdout.split('\n').map(t => t.trim()).filter(Boolean)

  for (const version of versions) {
    const exact = tags.find(t => normalizeVersion(t) === version)
    if (exact) return exact
    const token = tags.find(t => t.split(/[-_/]/).some(part => normalizeVersion(part) === version))
    if (token) return token
  }
  return null
}

/**
 * Walk the history of every file that may declare the mod version and return
 * the newest commit whose version equals one of `versions`. Several files are
 * tried because repos move the declaration around (a `version.properties` split
 * out of `gradle.properties`, say) mid-history.
 */
async function findVersionCommit(
  dir: string,
  versions: string[],
  versionFiles: string[],
  scope: '' | '--all' = ''
): Promise<string | null> {
  for (const versionFile of versionFiles) {
    const { stdout } = await execAsync(
      `git -C "${dir}" log ${scope} --format=%H -n ${MAX_HISTORY_SCAN} -- "${versionFile}"`
    ).catch(() => ({ stdout: '' }))
    const commits = stdout.split('\n').map(c => c.trim()).filter(Boolean)

    for (let i = 0; i < commits.length; i += SCAN_CONCURRENCY) {
      const batch = commits.slice(i, i + SCAN_CONCURRENCY)
      const found = await Promise.all(batch.map(async (sha) => {
        const text = await execAsync(`git -C "${dir}" show ${sha}:"${versionFile}"`, { maxBuffer: 1 << 22 })
          .then(r => r.stdout, () => null)
        return text && versions.includes(versionFromFile(versionFile, text) ?? '') ? sha : null
      }))
      const hit = found.find(Boolean)
      if (hit) return hit
    }
  }
  return null
}

/** Report where a source folder currently sits, `null` meaning undeterminable. */
function logSourceVersion(version: SourceVersion | null, log: Logger): void {
  log(chalk.gray(`Source version: ${version ? `${version.version} (${version.file})` : 'unknown'}`))
}

/**
 * Check out the revision of `dir` that matches the mod actually installed in
 * the pack. `versions` are candidate version strings (jar file name first, then
 * the jar's own `mcmod.info`), which can disagree when a build bumps its number
 * after writing its metadata.
 *
 * Order: already correct → pull the branch tip → a matching tag → the newest
 * commit declaring that version. Every step is best-effort; a repo that never
 * matches is left on its 1.12.x branch with a warning.
 *
 * @returns `false` only if the folder is unusable (not a repo, checkout failed).
 */
export async function syncToInstalledVersion(dir: string, versions: string[], log: Logger): Promise<boolean> {
  const current = await readSourceVersion(dir)
  logSourceVersion(current, log)
  if (current && versions.includes(current.version)) return true

  if (!await isGitRepo(dir)) {
    if (versions.length) log(chalk.yellow('Not a git repository, cannot switch to the installed version.'))
    return false
  }

  await stashDirty(dir, log)
  if (!await restoreWorkingBranch(dir, log)) return false
  if (!versions.length) return true

  log(chalk.cyan(`Updating sources to ${versions[0]}...`))
  await fetchRepo(dir, log)
  await pullCurrentBranch(dir)

  const atTip = await readSourceVersion(dir)
  if (atTip && versions.includes(atTip.version)) {
    log(chalk.green(`Branch tip is ${atTip.version}.`))
    return true
  }

  const tag = await findVersionTag(dir, versions)
  if (tag) {
    await execAsync(`git -C "${dir}" checkout --detach "${tag}"`)
    const at = await readSourceVersion(dir)
    log(chalk.green(`Checked out tag '${tag}' (${at?.version ?? 'unknown version'}).`))
    return true
  }

  const known = [atTip?.file, current?.file].filter((f): f is string => Boolean(f))
  const files = [...new Set([...known, ...VERSION_FILES])]
  const commit = await findVersionCommit(dir, versions, files)
    ?? await findVersionCommit(dir, versions, files, '--all')
  if (commit) {
    await execAsync(`git -C "${dir}" checkout --detach ${commit}`)
    const at = await readSourceVersion(dir)
    log(chalk.green(`Checked out ${commit.slice(0, 7)} (${at?.version ?? 'unknown version'}).`))
    return true
  }

  log(chalk.yellow(`Version ${versions[0]} not found in history, staying at ${atTip?.version ?? 'current revision'}.`))
  return true
}
