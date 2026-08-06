import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { ModTrackerState, TrackerConfig } from './state.js'
import { modListDiff } from '@mctools/curseforge'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { setContext } from '../../core/context.js'
import { errorMessage } from '../../util/helpers.js'
import { registerCommands } from './commands.js'
import { GitStaging } from './git.js'
import { updateManifest } from './manifest.js'
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

  const disposables: vscode.Disposable[] = [
    createMciWatcher(root, config, state, mciCache, git, logger, queueRefresh),
    createConfigWatcher(root, config.modTracker.configWatchPattern, queueRefresh),
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
  config: McToolsConfig,
  state: ModTrackerState,
  mciCache: InstanceCache,
  git: GitStaging,
  logger: Logger,
  queueRefresh: () => void
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(root, config.modTracker.inputPath)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  const mciPath = path.join(root, config.modTracker.inputPath)

  watcher.onDidChange(() => {
    void (async () => {
      logger.info('minecraftinstance.json changed')
      if (config.manifest.autoUpdate) {
        try {
          const fresh = await mciCache.read()
          await syncHeadInstance(state, git, mciPath)
          const old = headInstance(state, fresh)
          const diff = modListDiff(fresh, old)
          logger.info(`Manifest auto-update: +${diff.added?.length ?? 0} / -${diff.removed?.length ?? 0} / ~${diff.updated?.length ?? 0}`)
          await updateManifest(root, fresh, old, config.manifest.postfix, config.manifest, logger)
        }
        catch (err) {
          logger.error(`Manifest sync failed: ${errorMessage(err)}`)
        }
      }
      queueRefresh()
    })()
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
