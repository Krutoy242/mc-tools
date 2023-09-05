#!/usr/bin/env node

import yargs from 'yargs'
import fse from 'fs-extra'
import { assertPath } from '../../utils/src/args'
import { generateManifest } from '.'

const { readFileSync } = fse

const args = yargs(process.argv.slice(2))
  .scriptName('@mct/curseforge')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
  .option('verbose', {
    alias   : 'v',
    type    : 'boolean',
    describe: 'Log working process in stdout',
  })
  .option('ignore', {
    alias   : 'i',
    describe: 'Path to ignore file similar to .gitignore',
    coerce  : (f: string) => readFileSync(assertPath(f), 'utf8'),
  })
  .option('key', {
    alias       : 'k',
    describe    : 'Path to file with CurseForge API key',
    demandOption: true,
    coerce      : (f: string) => readFileSync(assertPath(f), 'utf8').trim(),
  })
  .option('mcinstance', {
    alias   : 'm',
    describe: 'Path to minecraftinstance.json',
    default : 'minecraftinstance.json',
  })
  .parseSync()

if (args.verbose) console.log('- Generating manifest -')
generateManifest(args.mcinstance, args)
