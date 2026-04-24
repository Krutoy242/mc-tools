import chalk from 'chalk'
import inquirer from 'inquirer'

import { binary } from './binary'
import { getConfig } from './config'
import { createWarningCache, ModStore } from './ModStore'
import { toggleMods } from './toggle'

export async function main(mcPath: string) {
  const warnings = createWarningCache()

  while (true) {
    const config = await getConfig(mcPath)
    const store = new ModStore(mcPath, config, warnings)

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type   : 'list',
        name   : 'action',
        message: 'What do you want to do? (Ctrl+C to exit)',
        choices: [
          { name: `${chalk.cyan('☰')} Select mods to toggle`, value: 'select_mods' },
          { name: `${chalk.yellow('❯')} Binary search`, value: 'binary' },
        ],
      },
    ])

    if (action === 'select_mods') await toggleMods(store.mods)
    else if (action === 'binary') await binary(store.mods)
  }
}

/**
 * Partition `arr` into two lists: items for which `p(item)` is truthy, and the rest.
 */
export function splitTwo<T>(arr: T[], p: (v: T) => boolean): [T[], T[]] {
  const truthy: T[] = []
  const falsy: T[] = []
  for (const v of arr) (p(v) ? truthy : falsy).push(v)
  return [truthy, falsy]
}
