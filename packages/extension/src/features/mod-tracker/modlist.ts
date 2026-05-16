import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import * as fs from 'node:fs/promises'
import { generateModsList } from '@mctools/modlist'
import * as path from 'pathe'
import { errorMessage } from '../../util/helpers.js'

export async function updateModsMd(
  workspaceRoot: string,
  fresh: Minecraftinstance,
  apiKey: string,
  modlistConfig: McToolsConfig['modlist'],
  logger: Logger
): Promise<void> {
  const modsMdPath = path.join(workspaceRoot, modlistConfig.outputPath)
  const timer = logger.time('MODS.md generation')
  try {
    if (!apiKey) {
      throw new Error('CurseForge API key is empty. Set mc-tools.curseforge.apiKey in settings or CF_API_KEY environment variable.')
    }
    logger.info(`Using CurseForge API key: ${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (${apiKey.length} chars)`)

    let old: Minecraftinstance | undefined
    if (modlistConfig.baselinePath) {
      const oldMciPath = path.join(workspaceRoot, modlistConfig.baselinePath)
      try {
        old = JSON.parse(await fs.readFile(oldMciPath, 'utf-8')) as Minecraftinstance
        logger.info(`MODS.md baseline: ${modlistConfig.baselinePath} (${old.installedAddons?.length ?? 0} mods)`)
      }
      catch {
        logger.warn(`MODS.md baseline not found: ${modlistConfig.baselinePath}`)
      }
    }
    if (!old) {
      logger.info('MODS.md baseline: none (no diff will be shown)')
    }

    let ignore: string | undefined
    if (modlistConfig.ignorePath) {
      const ignoreFullPath = path.join(workspaceRoot, modlistConfig.ignorePath)
      try {
        ignore = await fs.readFile(ignoreFullPath, 'utf-8')
        logger.info(`MODS.md ignore: ${modlistConfig.ignorePath}`)
      }
      catch {
        logger.warn(`MODS.md ignore file not found: ${modlistConfig.ignorePath}`)
      }
    }

    let template: string | undefined
    if (modlistConfig.templatePath) {
      const templateFullPath = path.join(workspaceRoot, modlistConfig.templatePath)
      try {
        template = await fs.readFile(templateFullPath, 'utf-8')
        logger.info(`MODS.md template: ${modlistConfig.templatePath}`)
      }
      catch {
        logger.warn(`MODS.md template not found: ${modlistConfig.templatePath}, using default`)
      }
    }

    const markdown = await generateModsList({
      fresh,
      old,
      key : apiKey,
      sort: modlistConfig.sortBy,
      ignore,
      template,
    })
    await fs.writeFile(modsMdPath, markdown, 'utf-8')
    timer()
  }
  catch (err) {
    timer()
    logger.error(`Failed to generate MODS.md: ${errorMessage(err)}`)
    throw err
  }
}
