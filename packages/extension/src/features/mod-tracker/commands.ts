import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { GitStaging } from './git.js'
import type { ModTrackerState } from './state.js'
import type { ModChangesProvider } from './tree.js'
import * as fs from 'node:fs/promises'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { regenerateManifest } from './manifest.js'
import { updateModsMd } from './modlist.js'
import { GlobalItem, ModItem } from './tree.js'

function assertAvailable<T>(value: T | null | undefined, name: string): T {
  if (value == null) throw new Error(`${name} is not available`)
  return value
}

export function registerCommands(
  treeProvider: ModChangesProvider,
  state: ModTrackerState,
  git: GitStaging | null,
  root: string | undefined,
  mcInstancePath: string | null,
  config: McToolsConfig,
  logger: Logger,
  refreshFn: () => Promise<void>
): vscode.Disposable[] {
  const showErr = (msg: string, err: unknown) => {
    vscode.window.showErrorMessage(`${msg}: ${errorMessage(err)}`)
  }

  return [
    vscode.commands.registerCommand('mc-tools.refreshModChanges', async () => {
      logger.info('Manual refresh triggered')
      await refreshFn()
    }),

    vscode.commands.registerCommand('mc-tools.stageMod', async (item: ModItem | GlobalItem) => {
      try {
        const g = assertAvailable(git, 'Git')
        if (item instanceof ModItem) {
          await g.add(item.change.files.map(u => u.fsPath))
          vscode.window.showInformationMessage(`Staged ${item.change.modName}`)
        }
        else if (item instanceof GlobalItem) {
          await g.add(item.uris.map(u => u.fsPath))
          vscode.window.showInformationMessage('Staged global changes')
        }
        await refreshFn()
      }
      catch (err) {
        showErr('Stage failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.stageAllMods', async () => {
      try {
        await assertAvailable(git, 'Git').addAll()
        vscode.window.showInformationMessage('Staged all changes')
        await refreshFn()
      }
      catch (err) {
        showErr('Stage all failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.updateModsMd', async () => {
      try {
        const r = assertAvailable(root, 'Root')
        const mcp = assertAvailable(mcInstancePath, 'mcInstancePath')
        const fresh = JSON.parse(await fs.readFile(mcp, 'utf-8')) as Minecraftinstance
        logger.info(`Generating MODS.md (${fresh.installedAddons?.length ?? 0} mods)`)
        await updateModsMd(r, fresh, config.curseforge.apiKey, config.modlist, logger)
        await refreshFn()
      }
      catch (err) {
        showErr('Update MODS.md failed', err)
      }
    }),

    vscode.commands.registerCommand('mc-tools.updateManifest', async () => {
      try {
        const r = assertAvailable(root, 'Root')
        logger.info(`Regenerating manifest${config.manifest.postfix || ''}.json`)
        await regenerateManifest(r, config.manifest.postfix, config.curseforge.apiKey, config.manifest, logger)
        vscode.window.showInformationMessage('Manifest regenerated')
        await refreshFn()
      }
      catch (err) {
        showErr('Update manifest failed', err)
      }
    }),
  ]
}
