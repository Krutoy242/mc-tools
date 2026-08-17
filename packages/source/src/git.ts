import type { ChildProcess } from 'node:child_process'
import type { Logger } from './types.js'
import type { SourceVersion } from './version.js'
import child_process from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { glob } from 'tinyglobby'
import { isBuildOf, normalizeVersion, readSourceVersion, VERSION_FILES, versionFromFile } from './version.js'

/** Environment for every child: git must fail rather than stop to ask for input. */
const CHILD_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' }

const exec = promisify(child_process.exec)

export async function execAsync(command: string, options: child_process.ExecOptions = {}) {
  return exec(command, { env: CHILD_ENV, ...options, encoding: 'utf8' })
}

/** First line of an unknown throwable, which is all a diagnostic needs. */
function reason(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).split('\n')[0]
}

/** Hard ceiling on a network git call, so nothing can hang the CLI forever. */
const NETWORK_TIMEOUT_MS = 20 * 60_000

/** Attempts of one network git call, the first try included. */
const NETWORK_ATTEMPTS = 4

/** Base backoff between those attempts, doubled each retry. */
const RETRY_DELAY_MS = 1000

/**
 * Whether a failure is the transport giving up rather than the remote refusing.
 * A local proxy or VPN — which anyone behind a blocked GitHub runs — resets a
 * noticeable share of connections, so `Recv failure: Connection was reset` says
 * nothing about the repository and is worth another attempt; a 404, an auth
 * error or a bad refspec is not.
 */
export function isTransientNetworkError(message: string): boolean {
  return /connection (?:was )?reset|recv failure|send failure|failed to connect|couldn't connect|could not resolve|connection timed out|operation timed out|remote end hung up|rpc failed|early eof|unexpected disconnect|transfer closed|empty reply from server|gnutls|ssl_read|schannel|returned error: 5\d\d|not closed cleanly/i
    .test(message)
}

export interface RetryOptions {
  /** Undo whatever a half-finished attempt left behind, before the next one. */
  beforeRetry?: () => Promise<void>
  /** Base backoff, doubled each retry. Tests set it to 0 to stay fast. */
  baseDelayMs?: number
  /** Off when `run` already prints git's own error, so it is not said twice. */
  logReason?  : boolean
}

/**
 * Run a network git call, repeating it while it fails in a way a repeat can
 * fix.
 */
export async function withNetworkRetry<T>(
  label: string,
  log: Logger,
  run: () => Promise<T>,
  { beforeRetry, baseDelayMs = RETRY_DELAY_MS, logReason = true }: RetryOptions = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    }
    catch (e) {
      const text = reason(e)
      if (attempt >= NETWORK_ATTEMPTS || !isTransientNetworkError(text)) throw e
      log(chalk.gray(`${label}${logReason ? `: ${text}` : ''} — retry ${attempt}/${NETWORK_ATTEMPTS - 1}...`))
      await beforeRetry?.()
      await delay(baseDelayMs * 2 ** (attempt - 1))
    }
  }
}

/**
 * Kill a git process *and its children*. `git fetch` hands the transfer to
 * `git-remote-https`, which keeps downloading — and keeps holding `.git` locks
 * that break every later run — when only its parent is killed.
 */
function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    child_process.spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
  }
  else {
    child.kill('SIGKILL')
  }
}

/**
 * Whether a live progress bar makes sense. It redraws itself with `\r`, which
 * a terminal collapses into one line — but a log file, a CI job or an agent's
 * captured output keeps every redraw, turning one fetch into hundreds of lines.
 */
const SHOW_PROGRESS = process.stderr.isTTY === true

/**
 * Run a long git command, forwarding its output to the log as it arrives.
 * `exec` withholds every byte until the process exits, which makes a transfer
 * of a heavy history — 400+ MiB is not unusual for a 1.12 mod — look exactly
 * like a freeze. Without a TTY the progress bar is not requested at all (git
 * even tells the remote to skip it), so only git's real lines are logged, once
 * the command is done.
 */
async function spawnGit(args: string[], log: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    const spawnArgs = SHOW_PROGRESS ? [...args, '--progress'] : args
    const child = child_process.spawn('git', spawnArgs, { env: CHILD_ENV, windowsHide: true })
    const timer = setTimeout(() => {
      killTree(child)
      reject(new Error(`timed out after ${NETWORK_TIMEOUT_MS / 60_000} minutes`))
    }, NETWORK_TIMEOUT_MS)

    // Only the tail is kept: enough for the error, and a cap on progress spam.
    let tail = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      tail = (tail + chunk).slice(-2000)
      if (SHOW_PROGRESS) log(chalk.gray(chunk), false)
    })

    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (SHOW_PROGRESS) {
        if (tail) log('')
      }
      else if (tail.trim()) {
        log(chalk.gray(tail.trimEnd()))
      }
      if (code === 0) resolve()
      else reject(new Error(tail.split(/[\r\n]+/).filter(l => l.trim()).pop() ?? `git exited with code ${code}`))
    })
  })
}

/** {@link spawnGit}, retried while the transport keeps dropping the transfer. */
async function gitProgress(args: string[], log: Logger, beforeRetry?: () => Promise<void>): Promise<void> {
  const verb = args[0] === '-C' ? args[2] : args[0]
  return withNetworkRetry(`git ${verb}`, log, async () => spawnGit(args, log), { beforeRetry, logReason: false })
}

/** A source folder is "real" only if it carries a meaningful amount of code. */
const MIN_SOURCE_FILES = 3

/**
 * JVM languages a 1.12.2 mod can be written in. Scala and Kotlin mods are just
 * as valid a source as Java ones — JEI Bees, for one, is pure Scala.
 */
const SOURCE_GLOBS = ['**/*.java', '**/*.scala', '**/*.kt']

/**
 * A folder counts as valid mod source if it is a directory holding at least
 * {@link MIN_SOURCE_FILES} JVM source files.
 */
export async function verifySourceFolder(dir: string, log: Logger): Promise<boolean> {
  try {
    const sources = await glob(SOURCE_GLOBS, { cwd: dir })
    if (sources.length >= MIN_SOURCE_FILES) return true
    log(chalk.yellow(`Folder ${dir} found but contains only ${sources.length} source files (requires >= ${MIN_SOURCE_FILES}).`))
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
async function pick112Branch(repoUrl: string, log: Logger): Promise<string | undefined> {
  const { stdout } = await withNetworkRetry(
    'git ls-remote',
    log,
    async () => execAsync(`git ls-remote --heads "${repoUrl}"`)
  )
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

  const branch = await pick112Branch(repoUrl, log).catch(() => undefined)
  log(chalk.blue(`Cloning ${repoUrl}... `), false)
  if (branch) log(chalk.green(`found ${branch}. `), false)
  else log(chalk.yellow('no 1.12.x branch found, cloning default... '), false)

  const onBranch = branch ? ['-b', branch] : []
  // A reset mid-clone leaves a partial folder that makes the next attempt fail
  // on "destination path already exists" instead of on the network.
  await gitProgress(['clone', '--depth', '1', ...onBranch, repoUrl, targetDir], log, async () => {
    await rm(targetDir, { recursive: true, force: true }).catch(() => {})
  })
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

    await stashDirty(dir, log)

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

/**
 * Stash uncommitted work so checkouts and pulls cannot fail on dirt. Untracked
 * files are ignored: `stash push` leaves them alone anyway, and counting them
 * as dirt means claiming to have stashed a folder that is still sitting there.
 */
async function stashDirty(dir: string, log: Logger): Promise<void> {
  const { stdout } = await execAsync(`git -C "${dir}" status --porcelain --untracked-files=no`)
  if (!stdout.trim()) return
  await execAsync(`git -C "${dir}" stash push -m "mctools-source-auto-stash"`)
  log(chalk.gray('Uncommitted changes stashed.'))
}

/**
 * Bring the repo's refs up to date. Deliberately shallow-preserving: deepening
 * costs a full repository download, so it is left to {@link deepenRepo}, which
 * runs only once the cheap ways to find the version are exhausted.
 */
async function fetchRepo(dir: string, log: Logger): Promise<void> {
  // `--quiet` drops the per-ref summary: a first fetch into a shallow clone
  // reports every tag the repo ever had — hundreds of lines for a mod carrying
  // 1.7.10..1.21.x branches. Errors still reach stderr, so retries and the
  // failure message are unaffected; `--progress` overrides it on a TTY.
  await gitProgress(['-C', dir, 'fetch', '--tags', '--force', '--quiet', 'origin'], log).catch((e: unknown) => {
    const text = reason(e)
    log(chalk.yellow(`Fetch failed: ${text}`))
    if (text.includes('.lock'))
      log(chalk.yellow('An earlier git run was interrupted — delete that stale lock file and retry.'))
  })
}

/**
 * Fetch the history a commit scan needs. A shallow clone holds only the tip, so
 * the scan is blind without this — but it downloads the repository's entire
 * history (hundreds of MiB for some mods), so it is announced, limited to the
 * branch being scanned, and reached only as a last resort.
 */
async function deepenRepo(dir: string, log: Logger): Promise<void> {
  const shallow = await execAsync(`git -C "${dir}" rev-parse --is-shallow-repository`)
    .then(r => r.stdout.trim() === 'true', () => false)
  if (!shallow) return

  const branch = await currentBranchName(dir).catch(() => '')
  log(chalk.cyan(`Shallow clone: downloading the full history of '${branch || 'origin'}' to search it. This may take minutes.`))
  const refspec = branch ? [branch] : []
  await gitProgress(['-C', dir, 'fetch', '--unshallow', 'origin', ...refspec], log)
    .catch((e: unknown) => log(chalk.yellow(`Could not deepen the clone: ${reason(e)}`)))
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
 * Whether a checked-out source version is what the pack installs. Besides an
 * exact hit, a source declaring the base of a build-numbered jar (`4.0.20` for
 * an installed `4.0.20.11`) is accepted: the build number is appended by the
 * build server and appears in no commit, so no revision matches any closer.
 */
function acceptVersion(source: SourceVersion, versions: string[], log: Logger): boolean {
  if (versions.includes(source.version)) return true

  const build = versions.find(v => isBuildOf(source.version, v))
  if (!build) return false
  log(chalk.green(`Source ${source.version} is ${build} without its build number.`))
  return true
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
  if (current && acceptVersion(current, versions, log)) return true

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
  if (atTip && acceptVersion(atTip, versions, log)) {
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
  await deepenRepo(dir, log)
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
