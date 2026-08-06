import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { Logger } from '../../core/logger.js'
import type { DetectorConfig } from './detector.js'
import type { GitStaging } from './git.js'
import type { ModChangesProvider } from './tree.js'
import * as fs from 'node:fs/promises'
import { modListDiff } from '@mctools/curseforge'
import * as path from 'pathe'
import * as vscode from 'vscode'
import { computeModChanges } from './detector.js'

export interface ModTrackerState {
  /** Parsed `minecraftinstance.json` at git HEAD, reused until HEAD moves. */
  headMci?     : Minecraftinstance
  /** Commit `headMci` was read from; `null` when the repo has no HEAD. */
  headCommit?  : string | null
  cachedStatus : { path: string, status: string }[]
  gitOpsRunning: boolean
}

export function createState(): ModTrackerState {
  return {
    cachedStatus : [],
    gitOpsRunning: false,
  }
}

export interface TrackerConfig extends DetectorConfig {
  modTrackerGlobalFiles: string[]
}

/**
 * Reads and parses `minecraftinstance.json` off the UI thread.
 *
 * The file is a single multi-megabyte line in this pack, so the parse is only
 * repeated when the file's mtime and size actually change.
 */
export class InstanceCache {
  private parsed?: Minecraftinstance
  private stamp = ''

  constructor(private filePath: string) {}

  async read(): Promise<Minecraftinstance> {
    const stat = await fs.stat(this.filePath)
    const stamp = `${stat.mtimeMs}:${stat.size}`
    if (this.parsed && stamp === this.stamp) return this.parsed

    const text = await fs.readFile(this.filePath, 'utf-8')
    this.parsed = JSON.parse(text) as Minecraftinstance
    this.stamp = stamp
    return this.parsed
  }
}

/**
 * Reads and parses `minecraftinstance.json` at HEAD, but only when HEAD moved.
 *
 * The blob is a couple of megabytes; fetching it on every refresh cost ~150 ms
 * of the git extension's time for a result that only changes on commit.
 */
export async function syncHeadInstance(
  state: ModTrackerState,
  git: GitStaging,
  mciPath: string
): Promise<boolean> {
  const commit = await git.headCommit()
  if (state.headMci && state.headCommit === commit) return false

  const headText = await git.showHead(mciPath)
  state.headCommit = commit
  if (!headText) return false
  try {
    state.headMci = JSON.parse(headText) as Minecraftinstance
    return true
  }
  catch {
    return false
  }
}

/** The HEAD instance if one was parsed, otherwise the working-tree one. */
export function headInstance(state: ModTrackerState, fallback: Minecraftinstance): Minecraftinstance {
  return state.headMci ?? fallback
}

export function buildTreeData(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  fresh: Minecraftinstance,
  status: { path: string, status: string }[],
  root: string,
  config: TrackerConfig,
  logger: Logger
): void {
  const old = headInstance(state, fresh)
  const diff = modListDiff(fresh, old)

  const changedUris = status
    .filter(s => s.status.trim() !== '')
    .map(s => vscode.Uri.file(path.join(root, s.path)))

  const globalUris = changedUris.filter((u) => {
    const rel = path.relative(root, u.fsPath).replace(/\\/g, '/')
    return config.modTrackerGlobalFiles.includes(rel)
  })

  const changes = computeModChanges(diff, changedUris, root, config)
  treeProvider.refresh(changes, globalUris)

  logger.info(
    `Mod diff: +${diff.added?.length ?? 0} added, -${diff.removed?.length ?? 0} removed, `
    + `~${diff.updated?.length ?? 0} updated, =${diff.both?.length ?? 0} unchanged | `
    + `${changes.length} visible changes | ${globalUris.length} global files`
  )
}

export async function runGitOps(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  fresh: Minecraftinstance,
  git: GitStaging,
  mciPath: string,
  root: string,
  config: TrackerConfig,
  logger: Logger
): Promise<void> {
  const gitTimer = logger.time('Git operations')
  const [headChanged, status] = await Promise.all([
    syncHeadInstance(state, git, mciPath),
    git.status(),
  ])
  gitTimer()

  const changedFiles = status.filter(s => s.status.trim() !== '')
  logger.info(`Git status: ${changedFiles.length} changed files (${status.length} total entries)`)

  const statusChanged = status.length !== state.cachedStatus.length
    || status.some((s, i) => s.path !== state.cachedStatus[i]?.path || s.status !== state.cachedStatus[i]?.status)

  state.cachedStatus = status

  if (headChanged || statusChanged) {
    buildTreeData(state, treeProvider, fresh, status, root, config, logger)
    logger.info('Mod tracker async update applied')
  }
  else {
    logger.info('Git data unchanged — no UI update needed')
  }
}
