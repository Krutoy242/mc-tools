#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'
import yargs from 'yargs'
import { parse } from 'yaml'
import type { Config } from '.'
import { findErrors } from '.'

const { existsSync, mkdirSync, readFileSync, writeFileSync } = fse

/* =============================================
=                Arguments                    =
============================================= */
const argv = yargs(process.argv.slice(2))
  .scriptName('mct-errors')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
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
  .option('config', {
    alias    : 'c',
    describe : 'Path to .yml file with configs',
    normalize: true,
    default  : relative('config.yml'),
  })
  .coerce('config', (f: string) => {
    if (!existsSync(f)) throw new Error(`${resolve(f)} doesnt exist. Provide correct path for with blacklist`)
    return parse(readFileSync(f, 'utf8')) as Config
  })
  .parseSync()

/* =============================================
=                                             =
============================================= */

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

(async () => {
  const unresolvedErrors = await findErrors(argv.log, argv.config as Config)

  if (unresolvedErrors.length)
    process.stdout.write(`Found ${unresolvedErrors.length} errors\n`)

  const text = unresolvedErrors.join('\n')

  if (argv.output) {
    mkdirSync(dirname(argv.output), { recursive: true })
    writeFileSync(argv.output, text)
  }
  else {
    process.stdout.write(`${text}\n`)
  }
})()
