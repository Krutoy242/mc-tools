import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse, relative } from 'node:path'
import process from 'node:process'

import chalk from 'chalk'

import { revertTS_to_ZS } from './parser'
import { peggyParse } from './peggy'

function write(obj: any) {
  return process.stdout.write(String(obj))
}

export function convertToTs(fileList: string[]) {
  return fileList.map((filePath) => {
    const pathRelative = relative(process.cwd(), filePath)
    write(chalk.blueBright(pathRelative))

    write(` ${chalk.rgb(30, 30, 30).inverse('read')}`)
    const fileContent = readFileSync(filePath, 'utf8')
    const fileParsed = parse(filePath)
    const doConvert = fileParsed.ext === '.zs'
    const newFilePath = join(fileParsed.dir, `${fileParsed.name}.${doConvert ? 'ts' : 'zs'}`)
    if (!doConvert) {
      write(` ${chalk.rgb(60, 60, 30).inverse('revert')}\n`)
      writeFileSync(newFilePath, revert(fileContent))
      unlinkSync(filePath)
      return undefined
    }

    // Convert
    let converted

    try {
      write(` ${chalk.rgb(30, 60, 30).inverse('convert to ts')}`)
      converted = peggyParse(fileContent)
    }
    catch (error) {
      process.stderr.write(`\n${chalk.red.inverse('ERROR')}: cant parse file ${chalk.blueBright(filePath)}\n${String(error)}\n`)
      return undefined
    }

    write(` ${chalk.rgb(30, 50, 90).inverse('save')}`)
    writeFileSync(newFilePath, converted)

    write(`\n`)
    return newFilePath
  })
}

export function revert(source: string): string {
  const result = revertTS_to_ZS(source)
  return result
    // Remove debris
    .replace(/\n*\/\/ CONVERSION_DEBRIS[\s\S\n]+?\/\/ CONVERSION_DEBRIS\n*/gm, '')
    // Remove escaped strings
    .replace(/'(.*(\\'.*)+)'/g, (m, r) => `"${r.replace(/\\'/g, '\'')}"`)
}
