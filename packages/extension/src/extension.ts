import process from 'node:process'
import * as vscode from 'vscode'
import { onConfigChange, readConfig } from './core/config.js'
import { DiagnosticsManager } from './core/diagnostics.js'
import { createLogger } from './core/logger.js'
import { activateCraftTweakerLog } from './features/crafttweaker-log/index.js'
import { activate as activateDebugLog } from './features/debug-log/index.js'
import { activateModTracker } from './features/mod-tracker/index.js'
import { isGitSubmoduleError } from './util/helpers.js'
import { isMinecraftModpack } from './util/normalize.js'

/* ------------------------------------------------------------------ */
/*  Global process-level suppression (run at module parse time)       */
/* ------------------------------------------------------------------ */

process.prependListener('unhandledRejection', (reason, promise) => {
  if (isGitSubmoduleError(reason)) {
    promise.catch(() => {})
    return
  }
  if (reason instanceof Error && reason.name === 'Canceled') {
    promise.catch(() => {})
  }
})

/* ------------------------------------------------------------------ */

class ExtensionHost {
  private outputChannel: vscode.LogOutputChannel
  private deactivateFns: Array<() => void> = []

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('mc-tools', { log: true })
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(this.outputChannel)

    const config = readConfig()
    const rootLogger = createLogger(this.outputChannel, 'core', config.logging.level)
    rootLogger.info('🚀 MC Tools extension activating')

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root || !await isMinecraftModpack(root)) {
      rootLogger.info('📦 Workspace does not look like a Minecraft modpack — MC Tools staying idle')
      return
    }

    const diagnostics = new DiagnosticsManager()
    context.subscriptions.push(diagnostics)

    context.subscriptions.push(onConfigChange(() => {
      rootLogger.info('⚙️ Configuration changed, please reload window for changes to take full effect')
    }))

    const features = [
      {
        name    : 'debug-log',
        activate: async () => activateDebugLog(context, diagnostics, createLogger(this.outputChannel, 'debug-log', config.logging.level), {
          path               : config.debugLog.path,
          maxInitialReadBytes: config.debugLog.maxInitialReadBytes,
          overlapBytes       : config.debugLog.overlapBytes,
          configPath         : config.debugLog.configPath,
          defaultMatchRegex  : config.debugLog.defaultMatchRegex,
        }),
      },
      {
        name    : 'crafttweaker-log',
        activate: async () => activateCraftTweakerLog(context, diagnostics, createLogger(this.outputChannel, 'crafttweaker-log', config.logging.level), {
          path          : config.crafttweakerLog.path,
          fileExtensions: config.crafttweakerLog.fileExtensions,
        }),
      },
      {
        name    : 'mod-tracker',
        activate: async () => activateModTracker(context, createLogger(this.outputChannel, 'mod-tracker', config.logging.level), config),
      },
    ]

    for (const feature of features) {
      try {
        const timer = rootLogger.time(`⚡ Activate ${feature.name}`)
        const deactivate = await feature.activate()
        this.deactivateFns.push(deactivate)
        timer()
      }
      catch (err) {
        rootLogger.error(`❌ Failed to activate ${feature.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    context.subscriptions.push(
      vscode.commands.registerCommand('mc-tools.showDebugLogPanel', () => this.outputChannel.show()),
      vscode.commands.registerCommand('mc-tools.showCtErrors', () => vscode.commands.executeCommand('workbench.actions.view.problems'))
    )

    rootLogger.info('✅ MC Tools extension activated')
  }

  deactivate(): void {
    for (const fn of this.deactivateFns) {
      try {
        fn()
      }
      catch {
        /* ignore */
      }
    }
    this.deactivateFns = []
    this.outputChannel.info('🛑 MC Tools extension deactivated')
  }
}

const host = new ExtensionHost()

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await host.activate(context)
}

export function deactivate(): void {
  host.deactivate()
}
