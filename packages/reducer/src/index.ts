import chalk from 'chalk'
import inquirer from 'inquirer'

import { binary } from './binary'
import { getConfig } from './config'
import { Mod } from './Mod'
import { ModStore } from './ModStore'
import { toggleMods } from './toggle'

export async function main(mcPath: string) {
  while (true) {
    const config = await getConfig(mcPath)
    const store = new ModStore(mcPath, config)

    const { action } = await inquirer.prompt<{action: string}>([
      {
        type   : 'list',
        name   : 'action',
        message: 'What do you want to do? (Ctrl+C to exit)',
        choices: [
          { name: `${chalk.cyan('☰')} Select mods to toggle`, value: 'select_mods' },
          { name: `${chalk.yellow('❯')} Binary search`, value: 'binary' },
          // { name: `${chalk.green('▶')} Enable everything`, value: 'enable_all' },
          // { name: `${chalk.red('◀')} Disable everything`, value: 'disable_all' },
        ],
      },
    ])

    if (action === 'enable_all') {
      await Mod.enable(store.mods)
    }
    else if (action === 'disable_all') {
      await Mod.disable(store.mods)
    }
    else if (action === 'select_mods') {
      await toggleMods(store.mods)
    }
    else if (action === 'binary') {
      await binary(store.mods)
    }
  }
}

export function splitTwo<T>(arr: T[], p: (v:T)=>boolean) {
  // eslint-disable-next-line no-sequences
  return arr.reduce((a, v) => (a[p(v) ? 0 : 1].push(v), a), [[], []] as [T[], T[]])
}
