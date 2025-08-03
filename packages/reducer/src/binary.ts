import chalk from 'chalk'
import { consola } from 'consola'
import _ from 'lodash'

import type { Mod } from './Mod'

import { getConfig } from './config'
import { getStatusText } from './Mod'
import { ModStore } from './ModStore'

export const style = {
  suspective: chalk.rgb(150, 120, 0),
  trusted   : chalk.rgb(0, 120, 30),
}

export async function binary(mcPath: string) {
  const config = await getConfig(mcPath)
  const store = new ModStore(mcPath, config)

  while (true) {
    consola.info(`There is ${chalk.green(store.mods.length)} mods:\n${drawMods(store.mods)}\n`)
    if (!await disableSecondHalf(store.mods)) return

    consola.info(`Now, does ${chalk.red('error')} still persist?\n${drawMods(store.mods)}\n`)
    if (!await askErrorPersist(store.mods)) return
  }
}

async function disableSecondHalf(mods: Mod[]) {
  const confirmed = await consola.prompt('', {
    type   : 'select',
    options: [
      {label: 'Disable Second half', value: 'disable', hint: 'Mods sorted by file size'},
      {label: 'Enable everything and exit', value: '', hint: 'Turn on all the mods'},
    ],
    cancel: 'undefined',
  })

  if (confirmed === undefined) return false

  if (!confirmed) {
    for (const m of mods) await m.enable()
    consola.success(`Enabled ${chalk.green(mods.length)} mods`)
    return false
  }
  const isSus = (m: Mod) => m.status !== 'trusted'
  const susMods = mods.filter(isSus)
  const enabledSusCount = () => susMods.filter(m => m.enabled).length
  for (const m of mods) {
    m.status === 'trusted' || enabledSusCount() > susMods.length / 2
      ? await m.disable()
      : await m.enable()
  }
  return true
}

async function askErrorPersist(mods: Mod[]) {
  const askResult = await consola.prompt('', {
    type   : 'select',
    options: [
      {label: 'No error', value: 'true', hint: ''},
      {label: 'Has error', value: '', hint: ''},
    ],
    cancel: 'undefined',
  })
  if (askResult === undefined) return false

  const noError = askResult === 'true'

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
  return true
}

function drawMods(mods: Mod[]) {
  const w = Math.min(process.stdout.columns ?? 80, 80)
  const chunks = _.chunk(mods, w)
    .map(chunk => chunk.map(m => m.statusText).join(''))
    .join('\n')

  const keys = Object.keys(style) as (keyof (typeof style))[]

  return `${keys.map(k => `Enabled ${chalk.gray(k)} ${getStatusText(k, false)}`).join('\n')
  }\n${keys.map(k => `Disabled ${chalk.gray(k)} ${getStatusText(k, true)}`).join('\n')}
${chunks}`
}
