import _ from 'lodash'
import escapeGlob from 'glob-escape'
import terminal_kit from 'terminal-kit'
import chalk from 'chalk'

import { getFetchInModsDir, getFileName, toggleMods } from '.'

const { terminal } = terminal_kit

export type ReduceLevels = {
  name: string
  description: string
  list: string[]
}[]

function loadReduceLevels(reduceLevels: ReduceLevels, mods?: string) {
  const fetchInModsDir = getFetchInModsDir(mods ?? '')

  const result: {
    registeredMods: string[]
    nonexistingEntries: string[]
    severalVariations: { entry: string; files: string[] }[]
    levels: {
      name: string
      description: string
      files: string[]
      disabledFiles: string[]
    }[]
  } = {
    levels            : [],
    registeredMods    : [],
    nonexistingEntries: [],
    severalVariations : [],
  }

  for (const reduceLevel of reduceLevels) {
    const lines = _.uniq(
      reduceLevel.list
        .filter(s => s.trim())
        .map((entry) => {
          const files = fetchInModsDir(`${escapeGlob(entry)}*.jar?(.disabled)`)
          if (files.length > 1) result.severalVariations.push({ entry, files })
          return { entry, path: files[0] }
        })
    )

    const [exist, nonexist] = _.partition(lines, o => !!o.path)

    result.nonexistingEntries.push(...nonexist.map(o => o.entry))

    const [disabledFiles, files] = _.partition(exist.map(o => o.path), o => o.endsWith('.disabled'))

    result.registeredMods.push(...files)
    result.registeredMods.push(...disabledFiles)
    result.levels.push({
      name       : reduceLevel.name,
      description: reduceLevel.description,
      files,
      disabledFiles,
    })
  }

  result.registeredMods = _.uniq(result.registeredMods)

  return result
}

export async function levels(modsPath: string, reduceLevels: ReduceLevels, cmdIndex?: number) {
  const fetchInModsDir = getFetchInModsDir(modsPath)
  if (!fetchInModsDir('*.jar?(.disabled)').length)
    throw new Error(`${modsPath} doesn't have mods in it (files ends with .jar and/or .disabled)`)

  const alreadyDisabled = fetchInModsDir('*.jar.disabled')
  const allEnabledMods = fetchInModsDir('*.jar')
  const totalModsLength = allEnabledMods.length + alreadyDisabled.length

  terminal.clear()

  const levels = loadReduceLevels(reduceLevels, modsPath)

  const unregMods = _.difference(allEnabledMods, levels.registeredMods).map(getFileName)
  if (unregMods.length) {
    console.warn(
      'This mods unregistered in lists. Add them first :>> ',
      unregMods
    )
  }

  if (levels.nonexistingEntries.length) {
    console.warn(
      'This lines have no files :>> ',
      levels.nonexistingEntries
    )
  }

  if (levels.severalVariations.length) {
    console.warn(
      'This lines have several variations :>> ',
      levels.severalVariations
    )
  }

  /**
   * Index of Levels choice
   */
  let reduceIndex = cmdIndex

  if (reduceIndex === undefined) {
    terminal`\nSelect `.brightYellow`Reduce Level`.styleReset()` for `.green(
      totalModsLength
    )` mods`.styleReset()`\n`

    const getLevelText = (i: number) => chalk.rgb(
      244,
      (255 - (255 / levels.levels.length) * i) | 0,
      59
    )(levels.levels[i].name)

    let cumulativeReduction = totalModsLength
    reduceIndex = (
      await terminal.singleColumnMenu(
        levels.levels.map(
          (l, i) => `${i + 1}: `
            + `${getLevelText(i)} `
            + `(${chalk.yellow.dim.italic(
              `${cumulativeReduction -= l.files.length + l.disabledFiles.length}`
            )}/${chalk.gray.italic(totalModsLength)}) `
            + `${chalk.rgb(100, 100, 100)(l.description)}`
        )
      ).promise
    ).selectedIndex

    terminal('\n')
  }

  const enableList = _.uniq(
    levels.levels
      .slice(0, reduceIndex + 1)
      .map(r => r.disabledFiles)
      .flat()
  )
  const disableList = _.uniq(
    levels.levels
      .slice(0, reduceIndex + 1)
      .map(r => r.files)
      .flat()
  )

  type Tuple = [file: string, toDisable: boolean]
  const modsTuples: Tuple[] = [
    ..._.difference(alreadyDisabled, enableList).map(f => [f, false] as Tuple),
    ...disableList.map(f => [f, true] as Tuple),
  ]

  await toggleMods(modsPath, 'Modifying mods', modsTuples)

  terminal('\n\n')
  process.exit(0)
}
