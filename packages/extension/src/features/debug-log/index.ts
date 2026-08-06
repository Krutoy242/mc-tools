import type { CompiledConfig } from '@mctools/errors'
import type { McToolsConfig } from '../../core/config.js'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import * as fs from 'node:fs/promises'
import { compileConfig, compileConfigFromYaml } from '@mctools/errors'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { LogWatcher } from '../../watcher.js'
import { DebugLogEngine } from './engine.js'
import { DebugLogDiagnosticsProvider } from './provider.js'

export async function activate(
  _ctx: vscode.ExtensionContext,
  diagnostics: DiagnosticsManager,
  logger: Logger,
  config: McToolsConfig['debugLog']
): Promise<() => void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) {
    logger.warn('No workspace folder, debug-log monitor disabled')
    return () => {}
  }

  const fullPath = path.join(root, config.path)
  const fileStat = await fs.stat(fullPath).catch(() => null)
  if (!fileStat) {
    logger.warn(`debug.log not found at ${config.path}`)
    return () => {}
  }
  logger.info(`debug.log: ${(fileStat.size / 1024 / 1024).toFixed(2)} MB total`)

  const uri = vscode.Uri.file(fullPath)

  /**
   * Everything downstream of the rule file. Rebuilding it is how a rule change
   * takes effect: the engine's seen-errors set and the accumulated diagnostics
   * both describe the *old* rules, so they are thrown away and the log is
   * re-read from its start under the new ones.
   */
  const start = async (engineConfig: CompiledConfig): Promise<() => void> => {
    const engine = new DebugLogEngine(engineConfig, logger)
    const provider = new DebugLogDiagnosticsProvider(diagnostics, logger, config.maxDiagnostics, config.sortOrder)

    // The watcher owns the initial tail read too, so the file is never loaded
    // whole and size/line counters can never drift from what was parsed.
    const watcher = new LogWatcher(
      {
        path               : config.path,
        debounceMs         : 300,
        maxInitialReadBytes: config.maxInitialReadBytes,
      },
      logger,
      async (chunk) => {
        const timer = logger.time(`Process debug-log chunk (${chunk.text.length} chars, line ${chunk.startLine})`)
        if (chunk.isTruncated) {
          engine.reset()
          provider.clear()
          logger.info('Debug-log rotated — engine and diagnostics reset')
        }
        const novel = engine.processChunk(chunk)
        if (novel.length) provider.append(novel, uri)
        timer()
      }
    )

    await watcher.start()

    return () => {
      watcher.dispose()
      provider.clear()
    }
  }

  let stop = await start(await loadEngineConfig(root, config, logger))

  const rules = watchRules(root, config.configPath, logger, async (next) => {
    stop()
    stop = await start(next)
    logger.info(`Reloaded error rules from ${config.configPath}`)
  })

  logger.info('Debug-log monitor activated')

  return () => {
    rules.dispose()
    stop()
    logger.info('Debug-log monitor deactivated')
  }
}

/**
 * Re-reads the rule file on every save, so tightening an `ignore` entry
 * re-filters the log without a window reload.
 *
 * The replacement is compiled *before* the caller is told to swap: a rule file
 * caught mid-edit is invalid YAML about as often as not, and letting that
 * through would drop every diagnostic and then — via the minimal fallback
 * config — flood the panel with exactly the entries the rules exist to hide.
 * Nothing happens on delete for the same reason: the last good rules stand.
 */
function watchRules(
  root: string,
  configPath: string,
  logger: Logger,
  onReload: (config: CompiledConfig) => Promise<void>
): vscode.Disposable {
  const fullPath = path.join(root, configPath)

  const reload = debounce(async () => {
    let next: CompiledConfig
    try {
      next = compileConfigFromYaml(await fs.readFile(fullPath, 'utf-8'))
    }
    catch (err) {
      logger.warn(`${configPath} is not usable, keeping the previous rules: ${errorMessage(err)}`)
      return
    }
    await onReload(next)
  }, 300, { trailing: true })

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, configPath))
  const trigger = () => {
    reload().catch(err => logger.error(`Rule reload failed: ${errorMessage(err)}`))
  }
  watcher.onDidChange(trigger)
  watcher.onDidCreate(trigger)
  return watcher
}

async function loadEngineConfig(
  root: string,
  config: { configPath: string, defaultMatchRegex: string },
  logger: Logger
) {
  const workspaceConfig = path.join(root, config.configPath)
  try {
    const yaml = await fs.readFile(workspaceConfig, 'utf-8')
    logger.info(`Loaded debug-log config from ${config.configPath}`)
    return compileConfigFromYaml(yaml)
  }
  catch {
    logger.info('No workspace debug-log config found, using minimal default')
    return compileConfig({
      ignore : '',
      match  : config.defaultMatchRegex,
      replace: [],
    })
  }
}
