import _ from 'lodash'
import escapeGlob from 'glob-escape'
import { getFetchInModsDir } from '.'

export type ReduceLevels = {
  name: string
  description: string
  list: string[]
}[]

export function loadReduceLevels(reduceLevels: ReduceLevels, cwd?: string) {
  const fetchInModsDir = getFetchInModsDir(cwd ?? '')

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
