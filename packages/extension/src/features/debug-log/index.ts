import type { McToolsConfig } from '../../core/config.js'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import * as fs from 'node:fs/promises'
import { compileConfig, compileConfigFromYaml } from '@mctools/errors'
import * as path from 'pathe'
import * as vscode from 'vscode'
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

  const engineConfig = await loadEngineConfig(root, config, logger)
  const engine = new DebugLogEngine(engineConfig, logger)
  const provider = new DebugLogDiagnosticsProvider(diagnostics, logger, config.maxDiagnostics)
  const uri = vscode.Uri.file(fullPath)

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
        logger.info('Debug-log truncated — engine and diagnostics reset')
      }
      const novel = engine.processChunk(chunk)
      if (novel.length) provider.append(novel, uri)
      timer()
    }
  )

  await watcher.start()

  logger.info('Debug-log monitor activated')

  return () => {
    watcher.dispose()
    provider.clear()
    logger.info('Debug-log monitor deactivated')
  }
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
