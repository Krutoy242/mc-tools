#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import chalk from 'chalk'
import fast_glob from 'fast-glob'
import yargs from 'yargs'

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
function lintFile(glob: string) {
  const command = `npx eslint --fix --quiet "${glob.replace(/\\/g, '/')}"`
  return execSync(command).toString().trim()
}

async function main() {
  process.stdout.write('loading file')

  const convertResult = convertToTs(argv.files)

  if (!convertResult.length) return
  if (argv.nolint) return

  // Lint & fix
  process.stdout.write('executing ESLint --fix')
  try {
    process.stdout.write(lintFile(argv.files.glob.replace(/\.zs/g, '.ts')))
  }
  catch (error) {
    const errStr = (error as any).stdout.toString()
    const isFatal = !!errStr.match(/\d+\s+error/im)

    if (isFatal)
      process.stdout.write(`${chalk.bgRed('ERROR')}: Fatal error during linting.:`)
    else
      process.stdout.write(`${chalk.bgYellow('WARN')}: Managable error during linting.:`)

    process.stdout.write(errStr)
    if (isFatal) return
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
