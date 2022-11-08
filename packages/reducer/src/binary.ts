import chalk from 'chalk'
import _ from 'lodash'
import terminal_kit from 'terminal-kit'
import type { Mod } from './Mod'
import { getStatusText } from './Mod'
import { ModStore } from './ModStore'

const { terminal: T } = terminal_kit

export const style = {
  suspective: chalk.rgb(150, 120, 0),
  trusted   : chalk.rgb(0, 120, 30),
}

export async function binary(modsPath: string) {
  const store = new ModStore(modsPath, 'minecraftinstance.json')

  while (true) {
    T('There is ', chalk.green(store.mods.length), 'mods:\n', drawMods(store.mods), '\n')
    await disableSecondHalf(store.mods)

    T('Now, does ', chalk.red('error'), ' still persist?\n', drawMods(store.mods), '\n')
    await askErrorPersist(store.mods)
  }
}

async function disableSecondHalf(mods: Mod[]) {
  if (await ask([style.suspective('Disable Second half'), chalk.white('Enable everything and exit')])) {
    for (const m of mods) await m.enable()
    T`Enabled `.green`${mods.length}`.styleReset()` mods\n`
    process.exit(0)
  }
  const isSus = (m: Mod) => m.status !== 'trusted'
  const susMods = mods.filter(isSus)
  const enabledSusCount = () => susMods.filter(m => m.enabled).length
  for (const m of mods) {
    (m.status === 'trusted' || enabledSusCount() > susMods.length / 2)
      ? await m.disable()
      : await m.enable()
  }
}

async function askErrorPersist(mods: Mod[]) {
  const noError = await ask([chalk.green('No error'), chalk.red('Has error')]) === 0

  for (const m of mods) {
    if (noError) {
      if (m.enabled) m.status = 'trusted'
      if (m.status !== 'trusted') m.status = 'suspective'
    }
    else {
      if (m.enabled && m.status !== 'trusted') m.status = 'suspective'
      else m.status = 'trusted'
    }
  }
}

async function ask(options: string[]) {
  const menu = T.singleColumnMenu(options, { cancelable: true })
  const result = (await menu.promise)
  if (result.canceled) return process.exit(0)
  if (result.selectedIndex > 1) throw new Error('Unimplemented option')
  return result.selectedIndex
}

function drawMods(mods: Mod[]) {
  const w = Math.min(T.width ?? 80, 80)
  const chunks = _.chunk(mods, w)
    .map(chunk => chunk.map(m => m.statusText).join(''))
    .join('\n')

  const keys = Object.keys(style) as any[]
  return `Enabled and Disabled ${
    chalk.gray(keys.join(' '))
  } ${keys.map(k => getStatusText(k, true)).join('')} ${keys.map(k => getStatusText(k, false)).join('')}
${chunks}`
}
