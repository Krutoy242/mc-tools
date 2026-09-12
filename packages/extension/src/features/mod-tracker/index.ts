import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { ModTrackerState, TrackerConfig } from './state.js'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { setContext } from '../../core/context.js'
import { resolveGitDir } from '../../util/git-state.js'
import { errorMessage } from '../../util/helpers.js'
import { registerCommands } from './commands.js'
import { GitStaging } from './git.js'
import { createManifestSync } from './manifest-sync.js'
import { buildTreeData, createState, headInstance, InstanceCache, runGitOps, syncHeadInstance } from './state.js'
import { ModChangesProvider } from './tree.js'

export async function activateModTracker(
  context: vscode.ExtensionContext,
  logger: Logger,
  config: McToolsConfig
): Promise<() => void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  const mcInstancePath = root ? path.join(root, config.modTracker.inputPath) : null

  const instances = mcInstancePath ? new InstanceCache(mcInstancePath) : null
  const hasMci = instances ? await instances.read().then(() => true).catch(() => false) : false

  if (!root || !hasMci) {
    logger.warn('No workspace folder or minecraftinstance.json not found, mod-tracker disabled')
    return () => {}
  }

  const treeProvider = new ModChangesProvider()
  const treeView = vscode.window.createTreeView('mc-tools.modChanges', {
    treeDataProvider: treeProvider,
    showCollapseAll : true,
  })
  context.subscriptions.push(treeView)
  // Only now does the contributed view have a provider — gating it on this key
  // keeps a broken "no data provider" panel out of unrelated workspaces.
  await setContext('modTrackerActive', true)

  const state = createState()
  const mciCache = instances!
  const mciPath = mcInstancePath!

  const git = new GitStaging(logger, root)
  await git.loadSubmodules()

  const trackerConfig: TrackerConfig = {
    ignoredMappingPatterns: config.modTracker.ignoredMappingPatterns,
    modTrackerGlobalFiles : config.modTracker.globalFiles,
  }

  const refreshFn = makeRefreshFn(state, treeProvider, mciCache, git, mciPath, root, trackerConfig, logger)
  const debouncedRefresh = debounce(refreshFn, 1000, { trailing: true })
  const queueRefresh = () => {
    debouncedRefresh().catch(err => logger.error(`Mod tracker refresh failed: ${errorMessage(err)}`))
  }

  const gitDir = await resolveGitDir(root)
  if (!gitDir) logger.warn('No git directory found — manifest sync cannot tell when a rebase is running')

  const manifestSync = createManifestSync({
    root,
    mciPath,
    gitDir,
    state,
    mciCache,
    git,
    config,
    logger,
    onWrite: queueRefresh,
  })

  const disposables: vscode.Disposable[] = [
    createMciWatcher(root, config.modTracker.inputPath, logger, manifestSync.queue, queueRefresh),
    createConfigWatcher(root, config.modTracker.configWatchPattern, queueRefresh),
    { dispose: manifestSync.dispose },
  ]

  await initializeTracker(state, treeProvider, mciCache, git, mciPath, root, trackerConfig, logger)

  const commands = registerCommands({ treeProvider, git, root, mciCache, config, logger, refreshFn })
  for (const d of [...commands, ...disposables]) {
    context.subscriptions.push(d)
  }

  logger.info('Mod tracker activated')

  return () => {
    for (const d of [...commands, ...disposables]) {
      d.dispose()
    }
    void setContext('modTrackerActive', false)
    logger.info('Mod tracker deactivated')
  }
}

function makeRefreshFn(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  mciCache: InstanceCache,
  git: GitStaging,
  mciPath: string,
  root: string,
  trackerConfig: TrackerConfig,
  logger: Logger
): () => Promise<void> {
  return async () => {
    const timer = logger.time('Mod tracker refresh')
    try {
      const fresh = await mciCache.read()
      logger.info(`minecraftinstance.json: ${fresh.installedAddons?.length ?? 0} mods installed`)

      buildTreeData(state, treeProvider, fresh, state.cachedStatus, root, trackerConfig, logger)
      timer()
      logger.info('Mod tracker refreshed (fast path)')

      if (!state.gitOpsRunning) {
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
  inputPath: string,
  logger: Logger,
  queueManifestSync: () => void,
  queueRefresh: () => void
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(root, inputPath)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)

  watcher.onDidChange(() => {
    logger.info('minecraftinstance.json changed')
    queueManifestSync()
    queueRefresh()
  })
  return watcher
}

function createConfigWatcher(
  root: string,
  patternStr: string,
  queueRefresh: () => void
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(root, patternStr)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  watcher.onDidChange(queueRefresh)
  watcher.onDidCreate(queueRefresh)
  watcher.onDidDelete(queueRefresh)
  return watcher
}

async function initializeTracker(
  state: ModTrackerState,
  treeProvider: ModChangesProvider,
  mciCache: InstanceCache,
  git: GitStaging,
  mciPath: string,
  root: string,
  trackerConfig: TrackerConfig,
  logger: Logger
): Promise<void> {
  const initTimer = logger.time('Mod tracker init')
  try {
    const fresh = await mciCache.read()
    const modCount = fresh.installedAddons?.length ?? 0
    const [, status] = await Promise.all([
      syncHeadInstance(state, git, mciPath),
      git.status(),
    ])
    state.cachedStatus = status
    const head = headInstance(state, fresh)
    buildTreeData(state, treeProvider, fresh, status, root, trackerConfig, logger)
    initTimer()
    logger.info(
      `Mod tracker initialised: ${modCount} current mods, ${head.installedAddons?.length ?? modCount} HEAD mods, `
      + `${status.filter(s => s.status.trim() !== '').length} changed files`
    )
  }
  catch (err) {
    initTimer()
    logger.error(`Mod tracker init failed: ${errorMessage(err)}`)
  }
}
