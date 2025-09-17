import chalk from 'chalk'
import { consola } from 'consola'
import inquirer from 'inquirer'

import { splitTwo } from '.'
import { Mod } from './Mod'
import { selectMods } from './toggle'

type Status = 'ignored' | 'suspective' | 'trusted'

export const style = {
  suspective         : chalk.rgb(197, 131, 56)('▗▖'), // '🟠',
  suspective_disabled: chalk.rgb(83, 67, 30)('▗▖'), // '🟤',
  trusted            : chalk.rgb(48, 146, 18)('▗▖'), // '🔵',
  trusted_disabled   : chalk.rgb(12, 53, 18)('▗▖'), // '🟣',
  ignored            : chalk.rgb(72, 112, 124)('▗▖'), // '⚫',
  ignored_disabled   : chalk.rgb(30, 40, 43)('▗▖'), // '⚫',
} as const

const modStatus = new Map<Mod, Status>()

function getStatus(mod: Mod) {
  return modStatus.get(mod) ?? 'suspective'
}

function setStatus(mod: Mod, value: Status) {
  return modStatus.set(mod, value)
}

function statusText(mod: Mod): string {
  const statusKey = getStatus(mod) + (mod.isDisabled ? '_disabled' : '') as keyof typeof style
  return style[statusKey]
}

export async function binary(mods: Mod[]) {
  consola.start('Binary Reducer')

  let manuallyTrusted = new Set<Mod>()
  let iteration = 1

  while (true) {
    consola.log(drawMods(mods))

    const {choice} = await inquirer.prompt<{choice: string}>([
      {
        type   : 'list',
        message: `Binary search, iteration #${iteration++}`,
        name   : 'choice',
        choices: [
          { name: `${style.trusted} Pick trusted mods (keep them ${chalk.red('disabled')})`, value: 'trust' },
          { name: `${style.ignored} Pick ignored mods (keep them ${chalk.green('enabled')})`, value: 'ignore' },
          { name: `${chalk.yellow('»')}  Disable half`, value: 'half' },
          { name: `${chalk.gray('✘')} Back`, value: 'exit' },
        ],
      },
    ])

    if (choice === 'exit') return

    if (choice === 'trust') {
      manuallyTrusted = new Set(await selectMods(mods, [...manuallyTrusted]))
      for (const m of manuallyTrusted) setStatus(m, 'trusted')
      await Mod.disable(manuallyTrusted)
      consola.success(`${manuallyTrusted.size} mods will be kept disabled.`)
      continue
    }

    if (choice === 'ignore') {
      const ignored = new Set(await selectMods(mods, mods.filter(m => getStatus(m) === 'ignored')))

      for (const m of ignored) setStatus(m, 'ignored')
      await Mod.enable(ignored)
      consola.success(`${ignored.size} mods will be kept enabled.`)
      continue
    }

    const changedCount = await disableSecondHalf(mods)
    if (changedCount <= 0) {
      consola.warn(`Cant enable/disable any mod`)
      continue
    }

    await askErrorPersist(mods)
  }
}

async function disableSecondHalf(mods: Mod[]): Promise<number> {
  const isSus = (m: Mod) => getStatus(m) === 'suspective'
  const susMods = mods.filter(isSus)
  const enabledSusCount = () => susMods.filter(m => m.enabled).length

  const [toDisable, toEnable] = splitTwo(mods, m => getStatus(m) === 'trusted' || enabledSusCount() > susMods.length / 2)
  return await Mod.disable(toDisable) + await Mod.enable(toEnable)
}

async function askErrorPersist(mods: Mod[]) {
  const { noError } = await inquirer.prompt<{ noError: boolean }>([
    {
      type   : 'list',
      name   : 'noError',
      message: 'After disabling half the mods, does the error still persist?',
      choices: [
        { name: `${chalk.green('✔')} No, the error is gone`, value: true },
        { name: `${chalk.red('✘')} Yes, the error is still there`, value: false },
      ],
    },
  ])

  for (const m of mods) {
    if (getStatus(m) === 'ignored') continue

    if (noError) {
      if (m.enabled) setStatus(m, 'trusted')
    }
    else {
      if (!m.enabled) setStatus(m, 'trusted')
    }
  }
}

function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}

function drawMods(mods: Mod[]) {
  const w = Math.min(process.stdout.columns ?? 80, 80)
  const chunks = chunk(mods.map(statusText), w)
    .map(chunk => chunk.join(''))
    .join('\n')

  const enabledCount = mods.filter(m => m.enabled).length
  const disabledCount = mods.length - enabledCount
  const trustedCount = mods.filter(m => getStatus(m) === 'trusted').length
  const suspectCount = mods.length - trustedCount
  const ignoredCount = mods.filter(m => getStatus(m) === 'ignored').length

  const legend = `Legend: ${['suspective', 'trusted', 'ignored']
    .map(k => `${chalk.gray(k)} ${style[k]}/${style[`${k}_disabled`]} (en/dis)`)
    .join(', ')}`

  const stats = `Stats: Total: ${chalk.bold(mods.length)}`
    + ` | Enabled: ${chalk.green(enabledCount)}`
    + ` | Disabled: ${chalk.red(disabledCount)}`
    + ` | Trusted: ${chalk.green(trustedCount)}`
    + ` | Suspect: ${chalk.yellow(suspectCount)}`
    + ` | Ignored: ${chalk.blue(ignoredCount)}`

  return `
${stats}
${chalk.dim(legend)}

${chunks}
`
}
