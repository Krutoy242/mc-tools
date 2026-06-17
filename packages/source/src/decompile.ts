import type { Ctx } from './types.js'
import chalk from 'chalk'
import glob from 'fast-glob'
import { join } from 'pathe'
import { execAsync, verifySourceFolder } from './git.js'

/**
 * Decompile `jarPath` into `modSources/<name>-decompiled` using a local
 * `cfr*.jar` (in `mcDir`) or, failing that, a `vineflower*.jar` (in
 * `modSources`). Returns the output folder on success.
 */
export async function decompileMod(jarPath: string, displayName: string, ctx: Ctx): Promise<string | null> {
  const outDir = join(ctx.modSources, `${displayName.replace(/[^\w-]/g, '')}-decompiled`)
  ctx.log(chalk.blue(`Decompiling ${jarPath} → ${outDir}...`))

  const cfrJars = await glob('cfr*.jar', { cwd: ctx.mcDir, absolute: true, suppressErrors: true })
  const vfJars = await glob('vineflower*.jar', { cwd: ctx.modSources, absolute: true, suppressErrors: true })

  let decompiled = false
  if (cfrJars.length > 0) {
    try {
      ctx.log(chalk.gray('Trying cfr... '), false)
      await execAsync(`java -jar "${cfrJars[0]}" "${jarPath}" --outputdir "${outDir}"`)
      decompiled = true
    }
    catch (e) {
      ctx.log(chalk.red(`cfr failed: ${e instanceof Error ? e.message : String(e)}`))
    }
  }
  if (!decompiled && vfJars.length > 0) {
    try {
      ctx.log(chalk.gray('Trying vineflower... '), false)
      await execAsync(`java -jar "${vfJars[0]}" -dgs=1 "${jarPath}" "${outDir}"`)
      decompiled = true
    }
    catch (e) {
      ctx.log(chalk.red(`vineflower failed: ${e instanceof Error ? e.message : String(e)}`))
    }
  }
  if (!decompiled) {
    ctx.log(chalk.red('No usable decompiler found (cfr*.jar in mcDir or vineflower*.jar in MOD_SOURCES).'))
    return null
  }

  if (await verifySourceFolder(outDir, ctx.log)) {
    ctx.log(chalk.green('Decompilation successful.'))
    return outDir
  }
  return null
}
