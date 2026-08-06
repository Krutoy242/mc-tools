import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { GitStaging } from './git.js'
import type { InstanceCache } from './state.js'
import type { ModChangesProvider } from './tree.js'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { regenerateManifest } from './manifest.js'
import { updateModsMd } from './modlist.js'
import { GlobalItem, ModItem } from './tree.js'

export interface CommandDeps {
  treeProvider: ModChangesProvider
  git         : GitStaging
  root        : string
  mciCache    : InstanceCache
  config      : McToolsConfig
  logger      : Logger
  refreshFn   : () => Promise<void>
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { git, root, mciCache, config, logger, refreshFn } = deps

  const showErr = (msg: string, err: unknown) => {
    logger.error(`${msg}: ${errorMessage(err)}`)
    void vscode.window.showErrorMessage(`${msg}: ${errorMessage(err)}`)
  }

  return [
    vscode.commands.registerCommand('mc-tools.refreshModChanges', async () => {
      logger.info('Manual refresh triggered')
      await refreshFn()
    }),

    vscode.commands.registerCommand('mc-tools.stageMod', async (item: ModItem | GlobalItem) => {
      try {
        if (item instanceof ModItem) {
          await git.add(item.change.files.map(u => u.fsPath))
          void vscode.window.showInformationMessage(`Staged ${item.change.modName}`)
        }
        else if (item instanceof GlobalItem) {
          await git.add(item.uris.map(u => u.fsPath))
          void vscode.window.showInformationMessage('Staged global changes')
        }
        await refreshFn()
      }
      catch (err) {
        showErr('Stage failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.stageAllMods', async () => {
      try {
        await git.addAll()
        void vscode.window.showInformationMessage('Staged all changes')
        await refreshFn()
      }
      catch (err) {
        showErr('Stage all failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.updateModsMd', async () => {
      try {
        const fresh = await mciCache.read()
        logger.info(`Generating MODS.md (${fresh.installedAddons?.length ?? 0} mods)`)
        await updateModsMd(root, fresh, config.curseforge.apiKey, config.modlist, logger)
        await refreshFn()
      }
      catch (err) {
        showErr('Update MODS.md failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.updateManifest', async () => {
      try {
        logger.info(`Regenerating manifest${config.manifest.postfix || ''}.json`)
        await regenerateManifest(root, config.manifest.postfix, config.curseforge.apiKey, config.manifest, logger)
        void vscode.window.showInformationMessage('Manifest regenerated')
        await refreshFn()
      }
      catch (err) {
        showErr('Update manifest failed', err)
      }
    }),
  ]
}
