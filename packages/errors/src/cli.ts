#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import yargs from 'yargs'
import { findErrors } from '.'

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
  throw new Error(`${argv.log} doesnt exist. Provide correct path for debug.log`)

if (argv.blacklist && !existsSync(argv.blacklist))
  throw new Error(`${argv.blacklist} doesnt exist. Provide correct path for .csv with blacklist`)

let ignore: RegExp[] | undefined
if (argv.blacklist) {
  const blacklistText = readFileSync(argv.blacklist, 'utf8')
  if (!blacklistText || !blacklistText.trim()) throw new Error(`${argv.blacklist} is empty.`)
  const lines = blacklistText.split('\n')
  if (lines.length <= 1) throw new Error(`${argv.blacklist} should contain header and content.`)
  if (lines.slice(1).some(s => s.split(',').length > 2)) throw new Error(`${argv.blacklist} should not contain "," characters.`)
  ignore = lines.slice(1).map(s => new RegExp(s.split(',')[0]))
}

const dbgLogText = readFileSync(argv.log, 'utf8')

/* =============================================
=                                             =
============================================= */
;(async () => {
  const unresolvedErrors = await findErrors(dbgLogText, ignore ?? [])

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
