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
  })
  .option('ignore-pattern', {
    alias   : 'i',
    type    : 'string',
    describe: 'Same as --ignore-pattern for ESLint',
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
function lintFile(glob: string, ignorePattern: string | undefined) {
  const command = `npx eslint --fix --quiet`
    + `${ignorePattern ? ` --ignore-pattern ${ignorePattern}` : ''}`
    + ` "${glob.replace(/\\/g, '/')}"`
  return execSync(command, { stdio: 'inherit' })?.toString().trim() ?? ''
}

async function main() {
  const fileList = fast_glob.sync(argv.files.replace(/\\/g, '/'), {
    dot   : true,
    ignore: argv.ignorePattern ? [argv.ignorePattern] : [],
  })
  if (!fileList.length) throw new Error(`${resolve(argv.files)} doesnt exist. Provide correct path.`)

  const convertResult = convertToTs(fileList)

  if (!convertResult.filter(Boolean).length) return
  if (argv.nolint) return

  // Lint & fix
  process.stdout.write('executing ESLint --fix')
  try {
    process.stdout.write(lintFile(argv.files.replace(/\.zs/g, '.ts'), argv.ignorePattern))
  }
  catch (error: any) {
    const errStr = (error.stdout ?? error).toString()
    const isFatal = !!errStr.match(/\d+\s+error/im)

    if (isFatal) {
      process.stdout.write(`\n${chalk.bgRed(' ERROR ')}: Fatal error during linting.:\n`)
      // eslint-disable-next-line no-console
      console.log(error)
      if (isFatal) return
    }

    process.stdout.write(`\n${chalk.bgYellow(' WARN ')}: Have some managable errors during linting.\n`)
  }

  if (argv.ts) return

  // Revert TS -> ZS
  convertResult.forEach((newFilePath, i) => {
    if (!newFilePath) return
    const linted = readFileSync(newFilePath, 'utf8')
    writeFileSync(fileList[i], revert(linted))
    unlinkSync(newFilePath)
  })
}

main()
