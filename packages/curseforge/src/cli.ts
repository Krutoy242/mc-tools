#!/usr/bin/env node

import yargs from 'yargs'
import fse from 'fs-extra'
import { assertPath } from '../../utils/src/args'
import { generateManifest } from './manifest'
import { generateModsList } from './modsDiff'

const { readFileSync, writeFileSync } = fse

yargs(process.argv.slice(2))
  .scriptName('mct-curseforge')
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
    type    : 'string',
    describe: 'Path to ignore file similar to .gitignore',
    coerce  : (f: string) => readFileSync(assertPath(f), 'utf8'),
  })
  .option('key', {
    alias       : 'k',
    type        : 'string',
    describe    : 'Path to file with CurseForge API key',
    demandOption: true,
    coerce      : (f: string) => readFileSync(assertPath(f), 'utf8').trim(),
  })
  .option('mcinstance', {
    alias   : 'm',
    type    : 'string',
    describe: 'Path to minecraftinstance.json',
    default : 'minecraftinstance.json',
  })
  .command({
    command : 'manifest',
    describe: 'Generate manifest.json file',
    handler : async (args) => {
      if (args.verbose) console.log('- Generating manifest -')
      await generateManifest(args.mcinstance, args as any)
    },
  })
  .command({
    command : 'modlist',
    describe: 'Generate .md file with all mods listed',
    builder : ya => ya
      .option('old', {
        alias    : 'l',
        type     : 'string',
        describe : 'Path to old minecraftinstance.json to compare with',
        normalize: true,
        coerce   : assertPath,
      })
      .option('template', {
        alias   : 't',
        type    : 'string',
        describe: 'Path to Handlebar template',
        coerce  : (f: string) => readFileSync(assertPath(f), 'utf8'),
      })
      .option('output', {
        alias   : 'o',
        type    : 'string',
        describe: 'Path to output file',
      })
      .option('sort', {
        alias   : 's',
        type    : 'string',
        describe: 'Sort field of CurseForge addon. Accept deep path like `cf2Addon.downloadCount`. `/` symbol at start of value change sort order.',
        default : 'addonID',
      }),
    handler: async (args) => {
      if (args.verbose) console.log('- Generating Modlist -')
      const content = await generateModsList(
        args.mcinstance,
        args.old,
        args as any
      )
      writeFileSync(args.output ?? 'MODS.md', content)
    },
  })
  .parse()
