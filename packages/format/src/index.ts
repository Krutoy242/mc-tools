/* eslint-disable no-console */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse } from 'node:path'
import { declarations } from './eslint'
import { peggyParse } from './peggy'
import { revertTS_to_ZS } from './parser'

interface FilesList {
  glob: string
  list: string[]
}

export function convertToTs(files: FilesList) {
  return files.list.map((filePath) => {
    const fileContent = readFileSync(filePath, 'utf8')
    const fileParsed = parse(filePath)

    const doConvert = fileParsed.ext === '.zs'
    const newFilePath = join(fileParsed.dir,
    `${fileParsed.name}.${doConvert ? 'ts' : 'zs'}`
    )
    if (!doConvert) {
      writeFileSync(newFilePath, revert(fileContent))
      unlinkSync(filePath)
      return null
    }

    // Convert
    console.log('converting to ts')
    const converted = convert(fileContent)
    writeFileSync(newFilePath, converted)

    return newFilePath
  })
    .filter(Boolean) as string[]
}

export function convert(source: string): string {
  // Cut out block comments and transform without them
  const blockComments: string[] = []
  const result = source.replace(/\/\*[\s\S\n]+?\*\//gm, (m) => {
    blockComments.push(m)
    return `/* COMMENT_${blockComments.length} */`
  })

  // // Return block comments
  // const converted = getConversion('convert')(result)
  //   // Restore block comments
  //   .replace(/\/\* COMMENT_(\d+) \*\//g, (m, r) => blockComments[Number(r) - 1])
  //   // Change tabs to spaces
  //   .replace(/^(?<s>\s*\t\s*)/gm, s => s.replace(/\t/g, '  '))

  const converted = peggyParse(result)

  return declarations + converted
}

export function revert(source: string): string {
  const result = revertTS_to_ZS(source)
  return result
    // Remove debris
    .replace(/\n*\/\/ CONVERSION_DEBRIS[\s\S\n]+?\/\/ CONVERSION_DEBRIS\n*/gm, '')
    // Remove escaped strings
    .replace(/'(.*(\\'.*)+)'/g, (m, r) => `"${r.replace(/\\'/g, '\'')}"`)
}
