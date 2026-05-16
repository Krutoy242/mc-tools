import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'
import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import * as fs from 'node:fs/promises'
import { loadMCInstanceFiltered } from '@mctools/curseforge'
import { generateManifest, incrementalUpdateManifest } from '@mctools/manifest'
import * as path from 'pathe'
import { errorMessage } from '../../util/helpers.js'

export async function updateManifest(
  workspaceRoot: string,
  fresh: Minecraftinstance,
  old: Minecraftinstance,
  postfix: string,
  manifestConfig: McToolsConfig['manifest'],
  logger: Logger
): Promise<void> {
  const manifestPath = path.join(workspaceRoot, `manifest${postfix ?? ''}.json`)
  const timer = logger.time('Manifest incremental update')
  try {
    const ignore = await readIgnoreFile(workspaceRoot, manifestConfig.ignorePath)
    const freshFiltered = loadMCInstanceFiltered(fresh, ignore)
    incrementalUpdateManifest(manifestPath, freshFiltered)
    timer()
  }
  catch (err) {
    timer()
    logger.error(`Failed to update manifest: ${errorMessage(err)}`)
    throw err
  }
}

export async function regenerateManifest(
  workspaceRoot: string,
  postfix: string,
  apiKey: string,
  manifestConfig: McToolsConfig['manifest'],
  logger: Logger
): Promise<void> {
  const timer = logger.time('Manifest generation')
  try {
    const ignore = await readIgnoreFile(workspaceRoot, manifestConfig.ignorePath)
    const inputFullPath = path.join(workspaceRoot, manifestConfig.inputPath)
    const manifestPath = path.join(workspaceRoot, `manifest${postfix ?? ''}.json`)

    let projectID: number | undefined
    let packVersion: string | undefined
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as { projectID?: number, version?: string }
      projectID = typeof existing.projectID === 'number' ? existing.projectID : undefined
      packVersion = existing.version
      logger.info(`Existing manifest: projectID=${projectID}, version=${packVersion}`)
    }
    catch {
      logger.warn(`Failed to parse existing manifest at ${manifestPath}`)
    }

    await generateManifest({
      mcinstancePath: inputFullPath,
      key           : apiKey,
      ignore,
      postfix       : postfix || undefined,
      verbose       : false,
      projectID,
      packVersion,
      name          : path.basename(workspaceRoot),
      cwd           : workspaceRoot,
    })
    timer()
    const stat = await fs.stat(manifestPath).catch(() => null)
    if (!stat) {
      throw new Error(`Manifest file was not written to expected path: ${manifestPath}`)
    }
    logger.info(`Manifest written to ${manifestPath} (${stat.size} bytes)`)
  }
  catch (err) {
    timer()
    logger.error(`Failed to generate manifest: ${errorMessage(err)}`)
    throw err
  }
}

async function readIgnoreFile(workspaceRoot: string, ignorePath: string): Promise<string | undefined> {
  if (!ignorePath) return undefined
  const fullPath = path.join(workspaceRoot, ignorePath)
  try {
    return await fs.readFile(fullPath, 'utf-8')
  }
  catch {
    return undefined
  }
}
