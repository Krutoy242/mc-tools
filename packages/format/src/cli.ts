#!/usr/bin/env node

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yargs from 'yargs'
import fast_glob from 'fast-glob'
import { lintFile } from './eslint'
import { convertToTs, revert } from '.'

/* =============================================
=                Arguments                    =
============================================= */
const argv = yargs(process.argv.slice(2))
  .scriptName('@mctools/format')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
  .command('$0 <files>', '')
  .positional('files', {
    describe    : 'Path to file / files for formatting',
    type        : 'string',
    normalize   : true,
    demandOption: true,
    coerce      : (glob: string) => {
      const list = fast_glob.sync(glob.replace(/\\/g, '/'), { dot: true })
      if (!list.length) throw new Error(`${resolve(glob)} doesnt exist. Provide correct path.`)
      return { glob, list }
    },
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

  const convertResult = convertToTs(argv.files)

  if (!convertResult.length) return
  if (argv.nolint) return

  // Lint & fix
  console.log('executing ESLint --fix')
  try {
    console.log(lintFile(argv.files.glob))
  }
  catch (error) {
    console.log('ERROR: Managable error during linting.:')

    const errStr = (error as any).stdout.toString()
    console.log(errStr)
    if (errStr.match(/\d+ error/im)) return
  }

  if (argv.ts) return

  // Revert TS -> ZS
  convertResult.forEach((newFilePath, i) => {
    const linted = readFileSync(newFilePath, 'utf8')
    writeFileSync(argv.files.list[i], revert(linted))
    unlinkSync(newFilePath)
  })
}

main()
