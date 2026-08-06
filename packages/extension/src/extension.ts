import type { McToolsConfig } from './core/config.js'
import type { Logger } from './core/logger.js'
import * as vscode from 'vscode'
import { onConfigChange, readConfig } from './core/config.js'
import { setContext } from './core/context.js'
import { DiagnosticsManager } from './core/diagnostics.js'
import { createLogger } from './core/logger.js'
import { activateCraftTweakerLog } from './features/crafttweaker-log/index.js'
import { activate as activateDebugLog } from './features/debug-log/index.js'
import { activateModTracker } from './features/mod-tracker/index.js'
import { errorMessage } from './util/helpers.js'
import { isMinecraftModpack } from './util/normalize.js'

/**
 * Settings that can only take effect by rebuilding the feature graph. Changes
 * to anything else (log level, diagnostic caps) are picked up on the next scan.
 */
const RELOAD_REQUIRED = [
  'mc-tools.debugLog.enabled',
  'mc-tools.debugLog.path',
  'mc-tools.debugLog.configPath',
  'mc-tools.debugLog.maxInitialReadBytes',
  'mc-tools.debugLog.sortOrder',
  'mc-tools.crafttweakerLog.enabled',
  'mc-tools.crafttweakerLog.path',
  'mc-tools.modTracker.enabled',
  'mc-tools.modTracker.inputPath',
  'mc-tools.modTracker.configWatchPattern',
]

interface Feature {
  name    : string
  enabled : boolean
  activate: () => Promise<() => void>
}

class ExtensionHost {
  private outputChannel: vscode.LogOutputChannel
  private deactivateFns: Array<() => void> = []

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('mc-tools', { log: true })
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(this.outputChannel)
    context.subscriptions.push(new vscode.Disposable(() => this.disposeFeatures()))

    const config = readConfig()
    const rootLogger = createLogger(this.outputChannel, 'core', config.logging.level)
    rootLogger.info('🚀 MC Tools extension activating')

    // Registered before the modpack check so the palette entries always resolve.
    context.subscriptions.push(
      vscode.commands.registerCommand('mc-tools.showDebugLogPanel', () => this.outputChannel.show()),
      vscode.commands.registerCommand('mc-tools.showCtErrors', () => vscode.commands.executeCommand('workbench.actions.view.problems'))
    )

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const isModpack = !!root && await isMinecraftModpack(root)
    await setContext('isModpack', isModpack)

    if (!isModpack) {
      rootLogger.info('📦 Workspace does not look like a Minecraft modpack — MC Tools staying idle')
      return
    }

    const diagnostics = new DiagnosticsManager()
    context.subscriptions.push(diagnostics)

    context.subscriptions.push(onConfigChange(e => this.onSettingsChanged(e, rootLogger)))

    for (const feature of this.buildFeatures(context, diagnostics, config)) {
      if (!feature.enabled) {
        rootLogger.info(`⏸️ ${feature.name} disabled by settings`)
        continue
      }
      try {
        const timer = rootLogger.time(`⚡ Activate ${feature.name}`)
        this.deactivateFns.push(await feature.activate())
        timer()
      }
      catch (err) {
        rootLogger.error(`❌ Failed to activate ${feature.name}: ${errorMessage(err)}`)
      }
    }

    rootLogger.info('✅ MC Tools extension activated')
  }

  private buildFeatures(
    context: vscode.ExtensionContext,
    diagnostics: DiagnosticsManager,
    config: McToolsConfig
  ): Feature[] {
    const log = (module: string) => createLogger(this.outputChannel, module, config.logging.level)

    return [
      {
        name    : 'debug-log',
        enabled : config.debugLog.enabled,
        activate: async () => activateDebugLog(context, diagnostics, log('debug-log'), config.debugLog),
      },
      {
        name    : 'crafttweaker-log',
        enabled : config.crafttweakerLog.enabled,
        activate: async () => activateCraftTweakerLog(context, diagnostics, log('crafttweaker-log'), config.crafttweakerLog),
      },
      {
        name    : 'mod-tracker',
        enabled : config.modTracker.enabled,
        activate: async () => activateModTracker(context, log('mod-tracker'), config),
      },
    ]
  }

  private onSettingsChanged(e: vscode.ConfigurationChangeEvent, logger: Logger): void {
    const changed = RELOAD_REQUIRED.filter(key => e.affectsConfiguration(key))
    if (!changed.length) return

    logger.info(`⚙️ Settings changed (${changed.join(', ')}) — reload required`)
    void vscode.window
      .showInformationMessage('MC Tools settings changed. Reload the window to apply them.', 'Reload Window')
      .then((choice) => {
        if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow')
      })
  }

  private disposeFeatures(): void {
    for (const fn of this.deactivateFns) {
      try {
        fn()
      }
      catch {
        /* a failing teardown must not block the rest */
      }
    }
    this.deactivateFns = []
  }

  deactivate(): void {
    this.disposeFeatures()
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
