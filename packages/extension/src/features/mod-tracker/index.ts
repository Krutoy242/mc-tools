import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { ModTrackerState, TrackerConfig } from './state.js'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { modListDiff } from '@mctools/curseforge'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { registerCommands } from './commands.js'
import { GitStaging } from './git.js'
import { updateManifest } from './manifest.js'
import { buildTreeData, createState, runGitOps } from './state.js'
import { ModChangesProvider } from './tree.js'

export async function activateModTracker(
  context: vscode.ExtensionContext,
  logger: Logger,
  config: McToolsConfig
): Promise<() => void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  const mcInstancePath = root ? path.join(root, config.modTracker.inputPath) : null
  const hasMci = mcInstancePath ? await fs.access(mcInstancePath).then(() => true).catch(() => false) : false

  if (!root || !hasMci) {
    logger.warn('No workspace folder or minecraftinstance.json not found, mod-tracker disabled')
  }

  const treeProvider = new ModChangesProvider()
  const treeView = vscode.window.createTreeView('mc-tools.modChanges', {
    treeDataProvider: treeProvider,
    showCollapseAll : true,
  })
  context.subscriptions.push(treeView)

  const state = createState()
  let git: GitStaging | null = null
  let refreshFn: (() => Promise<void>) | null = null
  const disposables: vscode.Disposable[] = []

  if (root && hasMci) {
    git = new GitStaging(logger, root)
    const mciPath = mcInstancePath!

    const trackerConfig: TrackerConfig = {
      ignoredMappingPatterns: config.modTracker.ignoredMappingPatterns,
      modTrackerGlobalFiles : config.modTracker.globalFiles,
    }

    refreshFn = makeRefreshFn(state, treeProvider, freshMci(mciPath), git, mciPath, root, trackerConfig, logger)
    const debouncedRefresh = debounce(refreshFn, 1000, { trailing: true })

    disposables.push(
      createMciWatcher(root, config, mciPath, git, logger, debouncedRefresh),
      createConfigWatcher(root, config.modTracker.configWatchPattern, debouncedRefresh)
    )

    await initializeTracker(state, treeProvider, mciPath, git, root, trackerConfig, logger)
  }

  const commands = registerCommands(treeProvider, state, git, root, mcInstancePath, config, logger, refreshFn ?? (async () => {}))
  for (const d of [...commands, ...disposables]) {
    context.subscriptions.push(d)
  }

  if (root && hasMci) logger.info('Mod tracker activated')

  return () => {
    for (const d of [...commands, ...disposables]) {
      d.dispose()
    }
    logger.info('Mod tracker deactivated')
  }
}

function freshMci(mciPath: string): () => Minecraftinstance {
  return () => JSON.parse(readFileSync(mciPath, 'utf-8')) as Minecraftinstance
}

function makeRefreshFn(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  getFresh: () => Minecraftinstance,
  git: GitStaging,
  mciPath: string,
  root: string,
  trackerConfig: TrackerConfig,
  logger: Logger
): () => Promise<void> {
  return async () => {
    const timer = logger.time('Mod tracker refresh')
    try {
      const fresh = getFresh()
      logger.info(`minecraftinstance.json: ${fresh.installedAddons?.length ?? 0} mods installed`)

      const status = state.cachedStatus
      buildTreeData(state, treeProvider, fresh, status, root, trackerConfig, logger)
      timer()
      logger.info('Mod tracker refreshed (fast path)')

      const running = state.gitOpsRunning
      if (!running) {
        state.gitOpsRunning = true
        runGitOps(state, treeProvider, fresh, git, mciPath, root, trackerConfig, logger)
          .catch(err => logger.error(`Git ops failed: ${errorMessage(err)}`))
          .finally(() => { state.gitOpsRunning = false })
      }
    }
    catch (err) {
      timer()
      logger.error(`Mod tracker refresh failed: ${errorMessage(err)}`)
    }
  }
}

function createMciWatcher(
  root: string,
  config: McToolsConfig,
  mciPath: string,
  git: GitStaging,
  logger: Logger,
  debouncedRefresh: () => Promise<void>
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(root, config.modTracker.inputPath)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  watcher.onDidChange(async () => {
    logger.info('minecraftinstance.json changed')
    if (config.manifest.autoUpdate) {
      try {
        const fresh = JSON.parse(await fs.readFile(mciPath, 'utf-8')) as Minecraftinstance
        const headText = await git.showHead(mciPath)
        const old = headText ? JSON.parse(headText) as Minecraftinstance : fresh
        const diff = modListDiff(fresh, old)
        logger.info(`Manifest auto-update: +${diff.added?.length ?? 0} / -${diff.removed?.length ?? 0} / ~${diff.updated?.length ?? 0}`)
        await updateManifest(root, fresh, old, config.manifest.postfix, config.manifest, logger)
      }
      catch (err) {
        logger.error(`Manifest sync failed: ${errorMessage(err)}`)
      }
    }
    void debouncedRefresh()
  })
  return watcher
}

function createConfigWatcher(
  root: string,
  patternStr: string,
  debouncedRefresh: () => Promise<void>
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(root, patternStr)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  watcher.onDidChange(() => void debouncedRefresh())
  watcher.onDidCreate(() => void debouncedRefresh())
  watcher.onDidDelete(() => void debouncedRefresh())
  return watcher
}

async function initializeTracker(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  mciPath: string,
  git: GitStaging,
  root: string,
  trackerConfig: TrackerConfig,
  logger: Logger
): Promise<void> {
  const initTimer = logger.time('Mod tracker init')
  try {
    const fresh = JSON.parse(readFileSync(mciPath, 'utf-8')) as Minecraftinstance
    const modCount = fresh.installedAddons?.length ?? 0
    const [headText, status] = await Promise.all([
      git.showHead(mciPath),
      git.status(),
    ])
    state.cachedHeadText = headText ?? undefined
    state.cachedStatus = status
    const headMods = state.cachedHeadText
      ? (JSON.parse(state.cachedHeadText) as Minecraftinstance).installedAddons?.length ?? modCount
      : modCount
    buildTreeData(state, treeProvider, fresh, status, root, trackerConfig, logger)
    initTimer()
    logger.info(`Mod tracker initialised: ${modCount} current mods, ${headMods} HEAD mods, ${status.filter(s => s.status.trim() !== '').length} changed files`)
  }
  catch (err) {
    initTimer()
    logger.error(`Mod tracker init failed: ${errorMessage(err)}`)
  }
}
