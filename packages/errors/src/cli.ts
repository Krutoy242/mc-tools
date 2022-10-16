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
  .detectLocale(false)
  .scriptName('mct-errors')
  .strict()
  .version()
  .option('output', {
    alias    : 'o',
    normalize: true,
    describe : 'Path for output with errors. If not specified output into stdout.',
  })
  .option('log', {
    alias    : 'l',
    default  : 'logs/debug.log',
    describe : 'debug.log file path (may need to be enabled by launcher)',
    normalize: true,
    coerce   : (f: string) => {
      if (!existsSync(f)) throw new Error(`${resolve(f)} doesnt exist. Provide correct path for debug.log`)
      const log = readFileSync(f, 'utf8')
      if (log.length < 100) throw new Error(`${resolve(f)} exist but too short. Probably wrong file.`)
      return log
    },
  })
  .option('blacklist', {
    alias    : 'b',
    describe : 'Path to .csv file with regExps',
    normalize: true,
  })
  .coerce('blacklist', (f: string) => {
    if (!existsSync(f)) throw new Error(`${resolve(f)} doesnt exist. Provide correct path for with blacklist`)
    return loadBlacklist(f)
  })
  .parseSync()

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

  if (argv.blacklist) ignore.push(...argv.blacklist)

  const defBLPath = relative('safe_errors.cfg')
  if (existsSync(defBLPath)) ignore.push(...loadBlacklist(defBLPath))

  const unresolvedErrors = await findErrors(argv.log, ignore)

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
