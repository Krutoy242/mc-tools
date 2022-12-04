import chalk from 'chalk'
import _ from 'lodash'
import terminal_kit from 'terminal-kit'

import type { Mod } from './Mod'
import { ModStore } from './ModStore'

const { terminal: T } = terminal_kit

export type ReduceLevels = {
  name: string
  description: string
  list: string[]
}[]

export async function levels(modsPath: string, reduceLevels: ReduceLevels, cmdIndex?: number) {
  const store = new ModStore(modsPath, 'minecraftinstance.json')

  // T.clear()

  const allLevelsGlobs = reduceLevels.map(r => r.list).flat()
  const globToRgx = (r: string) => new RegExp(`^${_.escapeRegExp(r)}.*$`)
  const levelsRgxs = allLevelsGlobs.map(globToRgx)

  const unregMods = store.mods.filter(m => !levelsRgxs.some(r => r.test(m.fileName)))
  if (unregMods.length) {
    console.warn(
      'This mods persist in mods/ folder but missed in levels list :>> ',
      unregMods.map(m => m.fileName)
    )
  }

  const levelsTuples = allLevelsGlobs
    .map((m, i) => [m, store.mods.filter(m =>
      levelsRgxs[i].test(m.fileName)
    )] as [string, Mod[]])

  const nonexistingEntries = levelsTuples
    .filter(([,a]) => !a.length)
    .map(([m]) => m)

  if (nonexistingEntries.length) console.warn('This lines have no files :>> ', nonexistingEntries)

  const severalVariations = levelsTuples
    .filter(([,a]) => a.length > 1)
    .map(([s, o]) => `${chalk.yellow(s)} [${o.map(m => m.fileName).join(', ')}]`)

  if (severalVariations.length) {
    T(
      'This lines have several variations :>> \n',
      severalVariations.join('\n'), '\n'
    )
  }

  /**
   * Index of Levels choice
   */
  let reduceIndex = cmdIndex

  if (reduceIndex === undefined) {
    T`\nSelect `.brightYellow`Reduce Level`.styleReset()` for `.green(
      store.mods.length
    )` mods`.styleReset()`\n`

    const getLevelText = (i: number) => chalk.rgb(
      244,
      (255 - (255 / reduceLevels.length) * i) | 0,
      59
    )(reduceLevels[i].name)

    let cumulativeReduction = allLevelsGlobs.length
    function getLevelLine(l: ReduceLevels[number], i: number) {
      return `${i + 1}: `
      + `${getLevelText(i)} `
      + `(${chalk.yellow.dim.italic(
        `${cumulativeReduction -= l.list.length}`
      )}/${chalk.gray.italic(store.mods.length)}) `
      + `${chalk.rgb(100, 100, 100)(l.description)}`
    }

    const promptResult = await T.singleColumnMenu(
      reduceLevels.map(getLevelLine),
      { cancelable: true }
    ).promise

    reduceIndex = promptResult.selectedIndex

    T('\n')
    if (promptResult.canceled) process.exit(0)
  }

  const disableList = reduceLevels
    .slice(0, reduceIndex + 1)
    .map(r => r.list)
    .flat()

  // Enable first
  levelsTuples
    .forEach(([,mods], i) => {
      if (i < disableList.length) return
      mods.forEach(m => m.enable())
    })

  // Then disable (including dependencies)
  levelsTuples
    .forEach(([,mods], i) => {
      if (i >= disableList.length) return
      mods.forEach(m => m.disable())
    })

  process.exit(0)
}
