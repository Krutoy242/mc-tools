import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { Logger } from '../../core/logger.js'
import type { DetectorConfig } from './detector.js'
import type { GitStaging } from './git.js'
import type { ModChangesProvider } from './tree.js'
import { modListDiff } from '@mctools/curseforge'
import * as path from 'pathe'
import * as vscode from 'vscode'
import { computeModChanges } from './detector.js'

export interface ModTrackerState {
  cachedHeadText?: string
  cachedStatus   : { path: string, status: string }[]
  gitOpsRunning  : boolean
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

export function buildTreeData(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  fresh: Minecraftinstance,
  status: { path: string, status: string }[],
  root: string,
  config: TrackerConfig,
  logger: Logger
): void {
  const old = state.cachedHeadText ? JSON.parse(state.cachedHeadText) as Minecraftinstance : fresh
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
  const [headText, status] = await Promise.all([
    git.showHead(mciPath),
    git.status(),
  ])
  gitTimer()

  const changedFiles = status.filter(s => s.status.trim() !== '')
  logger.info(`Git status: ${changedFiles.length} changed files (${status.length} total entries)`)

  const statusChanged = status.length !== state.cachedStatus.length
    || status.some((s, i) => s.path !== state.cachedStatus[i]?.path || s.status !== state.cachedStatus[i]?.status)
  const headChanged = headText !== state.cachedHeadText

  if (headText) state.cachedHeadText = headText
  state.cachedStatus = status

  if (headChanged || statusChanged) {
    buildTreeData(state, treeProvider, fresh, status, root, config, logger)
    logger.info('Mod tracker async update applied')
  }
  else {
    logger.info('Git data unchanged — no UI update needed')
  }
}
