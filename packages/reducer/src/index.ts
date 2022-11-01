import { resolve } from 'path'
import { rename } from 'fs/promises'
import fast_glob from 'fast-glob'
import terminal_kit from 'terminal-kit'

const { terminal } = terminal_kit

export const getFileName = (s: string) => s.replace(/^.*[\\/]/, '')

export function getFetchInModsDir(mods: string) {
  return function fetchInModsDir(globPattern: string): string[] {
    return fast_glob.sync(globPattern, { dot: true, cwd: resolve(mods) })
  }
}

export async function toggleMods(
  modsDir: string,
  actionName: string,
  mods: [string, boolean][],
  log = true
) {
  if (!mods.length) return

  let progressBar: terminal_kit.Terminal.ProgressBarController | undefined
  if (log) {
    progressBar = terminal.progressBar({
      title   : actionName.padEnd(15),
      width   : 80,
      syncMode: true,
      items   : mods.length,
    })
  }

  const updateBit = 1 / mods.length
  let progress = -updateBit

  const proms = Promise.all(mods.map(async ([oldPath, toDisable]) => {
    const fileName = getFileName(oldPath)
    progressBar?.startItem(fileName)

    const newPath = toDisable
      ? `${oldPath}.disabled`
      : oldPath.replace(/\.disabled$/, '')

    await rename(resolve(modsDir, oldPath), resolve(modsDir, newPath))

    progressBar?.update(progress += updateBit)
  }))

  progressBar?.update(1)
  terminal('\n\n')

  return await proms
}
