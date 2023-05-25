import type { Terminal } from 'terminal-kit'
import terminal_kit from 'terminal-kit'
import chalk from 'chalk'
import { ModStore } from './ModStore'
import type { Mod } from './Mod'

const { terminal: T } = terminal_kit

export async function interactive(modsPath: string) {
  const store = new ModStore(modsPath, 'minecraftinstance.json')

  const prefixes = {
    '-': (m: Mod) => m.disable(),
    '+': (m: Mod) => m.enable(),
  }

  const autoCompleter: Terminal.InputFieldOptions['autoComplete'] = (inputString) => {
    let prefix = inputString.charAt(0)
    if (!prefixes[prefix]) prefix = undefined
    const pure = (prefixes[prefix] ? inputString.substring(1) : inputString).toLocaleLowerCase()

    return store.mods
      .filter(m =>
        m.addon?.name.toLocaleLowerCase().includes(pure)
        || m.fileName.toLocaleLowerCase().includes(pure)
      )
      .map(m => (prefix ?? '') + m.addon?.name ?? m.fileName)
  }

  while (true) {
    T(`Select mod to disable. Leave ${chalk.gray`empty string`} to enable everything\n`)
    const res = await T.inputField({
      autoComplete    : autoCompleter,
      autoCompleteHint: true,
      autoCompleteMenu: true,
    }).promise

    if (!res) return await enableAndExit(store.mods)

    const prefix = res.charAt(0)
    const pure = prefixes[prefix] ? res.substring(1) : res

    const selectedMod = store.mods
      .find(m =>
        m.addon?.name.toLocaleLowerCase() === pure.toLocaleLowerCase()
        || m.fileName.toLocaleLowerCase() === pure.toLocaleLowerCase()
      )

    if (!selectedMod) {
      T(chalk.gray` No such mod\n`)
      continue
    }

    T`\n`

    await prefixes[prefix]?.(selectedMod) ?? selectedMod.disable()
  }
}

async function enableAndExit(mods: Mod[]) {
  for (const m of mods) await m.enable()
  return process.exit(0)
}
