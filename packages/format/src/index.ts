/* eslint-disable no-console */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse } from 'node:path'

import { revertTS_to_ZS } from './parser'
import { peggyParse } from './peggy'

interface FilesList {
  glob: string
  list: string[]
}

export function convertToTs(files: FilesList) {
  return files.list.map((filePath) => {
    const fileContent = readFileSync(filePath, 'utf8')
    const fileParsed = parse(filePath)

    const doConvert = fileParsed.ext === '.zs'
    const newFilePath = join(fileParsed.dir, `${fileParsed.name}.${doConvert ? 'ts' : 'zs'}`)
    if (!doConvert) {
      writeFileSync(newFilePath, revert(fileContent))
      unlinkSync(filePath)
      return null
    }

    // Convert
    console.log('converting to ts')
    const converted = peggyParse(fileContent)
    writeFileSync(newFilePath, converted)

    return newFilePath
  })
    .filter(Boolean) as string[]
}

export function revert(source: string): string {
  const result = revertTS_to_ZS(source)
  return result
    // Remove debris
    .replace(/\n*\/\/ CONVERSION_DEBRIS[\s\S\n]+?\/\/ CONVERSION_DEBRIS\n*/gm, '')
    // Remove escaped strings
    .replace(/'(.*(\\'.*)+)'/g, (m, r) => `"${r.replace(/\\'/g, '\'')}"`)
}
