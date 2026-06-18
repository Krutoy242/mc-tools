import type { Logger } from './types.js'
import child_process from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { glob } from 'tinyglobby'

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
    const { stdout: branchOut } = await execAsync(`git -C "${dir}" branch --show-current`)
    const currentBranch = branchOut.trim()
    if (/1\.12/.test(currentBranch)) return true

    log(chalk.cyan(`Current branch '${currentBranch}' is not 1.12.x. Looking for a suitable branch...`))

    const { stdout: remoteOut } = await execAsync(`git -C "${dir}" branch -r`)
    const candidates12 = remoteOut.split('\n').map(b => b.trim()).filter(b => /1\.12/.test(b))
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
