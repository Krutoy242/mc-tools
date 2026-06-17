#!/usr/bin/env tsx

import process from 'node:process'
import chalk from 'chalk'
import yargs from 'yargs'

import { findModSource } from './index.js'

const argv = yargs(process.argv.slice(2))
  .scriptName('@mctools/source')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
  .usage('$0 <query> [options]\n\nLocate, clone or decompile the source code of a Minecraft 1.12.2 mod.\nThe resolved absolute path is printed to stdout; diagnostics go to stderr.')
  .positional('query', { type: 'string', describe: 'Mod id, name, or jar filename fragment' })
  .option('mc', {
    alias   : 'm',
    type    : 'string',
    describe: 'Minecraft instance directory (default: cwd)',
  })
  .option('sources', {
    alias   : 's',
    type    : 'string',
    describe: 'Directory holding mod sources (default: $MOD_SOURCES)',
  })
  .option('key', {
    alias   : 'k',
    type    : 'string',
    describe: 'CurseForge API key (default: $CF_API_KEY)',
  })
  .option('silent', {
    type    : 'boolean',
    describe: 'Suppress diagnostic logging',
  })
  .demandCommand(1, 'Provide a mod id or name as the first argument.')
  .parseSync()

const query = String(argv._[0])

findModSource(query, {
  mcDir     : argv.mc,
  modSources: argv.sources,
  cfApiKey  : argv.key,
  silent    : argv.silent,
})
  .then((path) => {
    if (!path) process.exit(1)
    process.stdout.write(`${path}\n`)
  })
  .catch((e: unknown) => {
    process.stderr.write(`${chalk.red(e instanceof Error ? e.message : String(e))}\n`)
    process.exit(1)
  })
