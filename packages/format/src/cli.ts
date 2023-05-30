#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse, resolve } from 'node:path'
import yargs from 'yargs'
import { lintFile } from './eslint'
import { convert, revert } from '.'

/* =============================================
=                Arguments                    =
============================================= */
function assertPath(f: string, errorText?: string) {
  if (existsSync(f)) return f
  throw new Error(`${resolve(f)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

const argv = yargs(process.argv.slice(2))
  .scriptName('mct-format')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
  .command('$0 <file>', '')
  .positional('file', {
    describe    : 'Path to file for formatting',
    type        : 'string',
    normalize   : true,
    demandOption: true,
    coerce      : assertPath,
  })
  .option('ts', {
    alias    : 't',
    type     : 'boolean',
    conflicts: 'nolint',
    describe : 'Create linted .ts file without converting it back.',
  })
  .option('nolint', {
    alias    : 'l',
    conflicts: 'ts',
    describe : 'Do not lint file',
  })
  .parseSync()

/* ============================================
=                                             =
============================================= */

async function main() {
  console.log('loading file')
  const fileContent = readFileSync(argv.file, 'utf8')

  const fileParsed = parse(argv.file)
  const isConvers = fileParsed.ext === '.zs'
  const newFilePath = join(fileParsed.dir,
    `${fileParsed.name}.${isConvers ? 'ts' : 'zs'}`
  )
  if (!isConvers)
    return writeFileSync(newFilePath, revert(fileContent))

  // Convert
  console.log('converting to ts')
  const converted = convert(fileContent)
  writeFileSync(newFilePath, converted)

  if (argv.nolint) return

  // Lint & fix
  console.log('executing ESLint --fix')
  try {
    console.log(lintFile(newFilePath))
  }
  catch (error) {
    console.log('ERROR: Managable error during linting.:')

    const errStr = (error as any).stdout.toString()
    console.log(errStr)
    if (errStr.match(/\d+ error/im)) return
  }

  if (argv.ts) return

  // Revert
  const linted = readFileSync(newFilePath, 'utf8')
  writeFileSync(argv.file, revert(linted))
  unlinkSync(newFilePath)
}

main()
