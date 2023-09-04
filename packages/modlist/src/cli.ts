#!/usr/bin/env node

import yargs from 'yargs'
import fse from 'fs-extra'
import type { Minecraftinstance } from 'mct-curseforge/minecraftinstance'
import { assertPath } from '../../utils/src/args'
import { generateModsList } from '.'

const { readFileSync, writeFileSync } = fse

const args = yargs(process.argv.slice(2))
  .scriptName('mct-modlist')
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
  .option('old', {
    alias    : 'l',
    describe : 'Path to old minecraftinstance.json to compare with',
    normalize: true,
    coerce   : assertPath,
  })
  .option('template', {
    alias   : 't',
    describe: 'Path to Handlebar template',
    coerce  : (f: string) => readFileSync(assertPath(f), 'utf8'),
  })
  .option('output', {
    alias   : 'o',
    describe: 'Path to output file',
    default : 'MODS.md',
  })
  .option('sort', {
    alias   : 's',
    describe: 'Sort field of CurseForge addon. Accept deep path like `cf2Addon.downloadCount`. `/` symbol at start of value flip sort order.',
    default : 'addonID',
  })
  .parseSync()

if (args.verbose) console.log('- Generating Modlist -')
generateModsList(
  args.mcinstance,
  args.old,
  args
).then(content => writeFileSync(args.output, content))
