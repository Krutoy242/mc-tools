#!/usr/bin/env node

import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import fse from 'fs-extra'
import yargs from 'yargs'

import { generateManifest } from './index.js'

const { readFileSync } = fse

const args = yargs(process.argv.slice(2))
  .scriptName('@mctools/manifest')
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
  .option('name', {
    type    : 'string',
    describe: 'Override pack name (default: autodetect from cwd)',
  })
  .option('mc-version', {
    type    : 'string',
    describe: 'Override Minecraft version (default: autodetect from minecraftinstance.json/debug.log)',
  })
  .option('project-id', {
    type    : 'number',
    describe: 'Override CurseForge project ID (default: read from existing manifest.json)',
  })
  .option('pack-version', {
    type    : 'string',
    describe: 'Pack version to write into manifest',
  })
  .option('postfix', {
    type    : 'string',
    describe: 'Suffix for output file: manifest<postfix>.json',
  })
  .parseSync()

if (args.verbose) console.log('- Generating manifest -')
generateManifest(args.mcinstance, {
  ignore     : args.ignore,
  key        : args.key,
  name       : args.name,
  mcVersion  : args['mc-version'],
  projectID  : args['project-id'],
  packVersion: args['pack-version'],
  postfix    : args.postfix,
  verbose    : args.verbose,
}).catch((err: Error) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
