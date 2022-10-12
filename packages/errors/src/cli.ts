#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import yargs from 'yargs'
import { findErrors, parseBlacklist } from '.'

/* =============================================
=                Arguments                    =
============================================= */
const argv = yargs(process.argv.slice(2))
  .alias('h', 'help')
  .option('log', {
    alias   : 'l',
    type    : 'string',
    describe: 'debug.log file path (may need to be enabled by launcher)',
    default : 'logs/debug.log',
  })
  .option('blacklist', {
    alias   : 'b',
    type    : 'string',
    describe: 'Path to .csv file with regExps',
  })
  .option('output', {
    alias   : 'o',
    type    : 'string',
    describe: 'Path for output with errors. If not specified output into stdout.',
  })
  .parseSync()

if (!existsSync(argv.log))
  throw new Error(`${resolve(argv.log)} doesnt exist. Provide correct path for debug.log`)

if (argv.blacklist && !existsSync(argv.blacklist))
  throw new Error(`${resolve(argv.blacklist)} doesnt exist. Provide correct path for .csv with blacklist`)

/* =============================================
=                                             =
============================================= */
function loadBlacklist(filePath: string) {
  return parseBlacklist(readFileSync(filePath, 'utf8'))
}

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

(async () => {
  const ignore: RegExp[] = []

  if (argv.blacklist) ignore.push(...loadBlacklist(argv.blacklist))

  const defBLPath = relative('safe_errors.cfg')
  if (existsSync(defBLPath)) ignore.push(...loadBlacklist(defBLPath))

  const dbgLogText = readFileSync(argv.log, 'utf8')

  const unresolvedErrors = await findErrors(dbgLogText, ignore)

  if (unresolvedErrors.length)
    process.stdout.write(`Found ${unresolvedErrors.length} errors\n`)

  if (argv.output) {
    mkdirSync(dirname(argv.output), { recursive: true })
    writeFileSync(argv.output, unresolvedErrors.join('\n'))
  }
  else {
    process.stdout.write(`${unresolvedErrors.join('\n')}\n`)
  }
})()
