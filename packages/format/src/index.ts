import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse, relative } from 'node:path'
import process from 'node:process'

import { consola } from 'consola'
import { colors } from 'consola/utils'

import { revertTS_to_ZS } from './parser'
import { peggyParse } from './peggy'

export function convertToTs(fileList: string[]) {
  return fileList.map((filePath) => {
    const pathRelative = relative(process.cwd(), filePath)
    process.stdout.write(colors.blueBright(pathRelative))

    process.stdout.write(` ${colors.inverse(colors.gray('read'))}`)
    const fileContent = readFileSync(filePath, 'utf8')
    const fileParsed = parse(filePath)
    const doConvert = fileParsed.ext === '.zs'
    const newFilePath = join(fileParsed.dir, `${fileParsed.name}.${doConvert ? 'ts' : 'zs'}`)
    if (!doConvert) {
      process.stdout.write(` ${colors.dim(colors.cyan(colors.inverse('revert')))}\n`)
      writeFileSync(newFilePath, revert(fileContent))
      unlinkSync(filePath)
      return undefined
    }

    // Convert
    let converted

    try {
      process.stdout.write(` ${colors.green(colors.inverse('convert to ts'))}`)
      converted = peggyParse(fileContent)
    }
    catch (error) {
      consola.error(`cant parse file ${colors.blueBright(filePath)}`, error)
      return undefined
    }

    process.stdout.write(` ${colors.blue(colors.inverse('save'))}`)
    writeFileSync(newFilePath, converted)

    process.stdout.write(`\n`)
    return newFilePath
  })
}

export function revert(source: string): string {
  const result = revertTS_to_ZS(source.replace(/\r/g, ''))
  return result
    // Remove debris
    .replace(/\n*\/\/ CONVERSION_DEBRIS[\s\S]+?\/\/ CONVERSION_DEBRIS\n*/g, '')
    // Remove escaped strings
    .replace(/'(.*(\\'.*))'/g, (m, r) => `"${r.replace(/\\'/g, '\'')}"`)
}
