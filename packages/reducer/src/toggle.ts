/* eslint-disable style/key-spacing */
import './CheckboxPlusPromptEx'

import chalk from 'chalk'
import fuzzy from 'fuzzy'
import inquirer from 'inquirer'

import { Mod } from './Mod'

interface FuzzResult {
  match: string
  mod : Mod
}

interface ModChoice {
  disabled?: boolean | string
  display: string
  name : string
  prefix : string
  tail : string
  value : Mod
}

export async function toggleMods(mods: Mod[]) {
  await selectMods(mods, mods.filter(m => !m.disabled), async (choice, isEnable) => {
    const { value: mod } = choice

    const isToggle = typeof isEnable === 'undefined'

    let errored = false
    if (isToggle || mod.enabled !== isEnable) {
      errored = !await (mod.enabled
        ? Mod.disable([mod], true)
        : Mod.enable([mod], true))
    }

    choice.tail = errored
      ? chalk.rgb(179, 39, 39)(' Error:') + chalk.rgb(110, 32, 32)(' could not rename .jar file')
      : ''

    return !errored
  })
}

export async function selectMods(
  mods: Mod[],
  selectedAlready: Mod[],
  onToggle?: (choice: ModChoice, isEnable: boolean | undefined) => Promise<boolean>
): Promise<Mod[]> {
  const prompt = inquirer.prompt<{
    selectedMods: Mod[]
  }>([{
    type      : 'checkbox-plus',
    name      : 'selectedMods',
    message   : `${chalk.bold('Toggle mods (fuzzy search available)')}\n  ${chalk.cyan('ctrl+a')} ${chalk.dim('enable all')} | ${chalk.cyan('ctrl+r')} ${chalk.dim('disable all')} | ${chalk.cyan('space')} ${chalk.dim('toggle')} | ${chalk.cyan('enter')} ${chalk.dim('save')}`,
    pageSize  : 25,
    highlight : true,
    searchable: true,
    default   : selectedAlready,
    async source(_answersSoFar: any, input = '') {
      return filterMods(mods, input)
    },
    onToggle,
  }])

  const { selectedMods } = await prompt

  return selectedMods || []
}

export function filterMods(mods: Mod[], searchStr: string) {
  const [pre, post] = chalk.underline('::').split('::')
  const fuzzyResult = fuzzy.filter(searchStr, mods, {
    extract: mod => mod.displayRaw,
    pre,
    post,
  })
  const uniq = fuzzyResult.map(o => ({ mod: o.original, match: o.string } as FuzzResult))
    .sort(({ mod: a }, { mod: b }) =>
      +b.enabled - +a.enabled
      || b.getDependentsCount() - a.getDependentsCount())

  const result: ModChoice[] = []
  const addModAndDependents = (mod: Mod, prefix: string, antiloop: Set<Mod>) => {
    if (antiloop.has(mod)) return
    antiloop.add(mod)

    const matchStr = uniq.find(fuzz => fuzz.mod === mod)?.match
    const display = !prefix && matchStr
      ? matchStr
      : mod.displayRaw

    result.push({
      get name() {
        return `${chalk.gray(this.prefix)}${
          this.value.disabled ? chalk.gray('○') : chalk.green('●')
        } ${
          this.disabled
            ? chalk.rgb(128, 128, 128)(this.display).replace(/(◂.*▸)/, (_, r) => chalk.rgb(39, 39, 39)((r as string)))
            : Mod.displayify(this.display)
        } ${this.tail}`.trim()
      },
      value   : mod,
      disabled: !!prefix,
      prefix,
      display,
      tail: '',
    })

    mod.dependents.keys().forEach((dep, i) => {
      const isLast = i === mod.dependents.size - 1
      const newPrefix = prefix.replace(/├─/g, '│ ').replace(/└─/g, '  ')
      addModAndDependents(dep, `${newPrefix}${isLast ? '└─' : '├─'}`, antiloop)
    })
  }

  for (const { mod } of uniq) addModAndDependents(mod, '', new Set())

  return result
}
