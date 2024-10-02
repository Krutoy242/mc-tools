#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import yargs from 'yargs'

import type { ReduceLevels } from './levels'

import { binary } from './binary'
import { interactive } from './interactive'
import { levels } from './levels'

/* =============================================
=                Arguments                    =
============================================= */
function assertPath(f: string, errorText?: string) {
  if (existsSync(f)) return f
  throw new Error(`${resolve(f)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

yargs(process.argv.slice(2))
  .alias('h', 'help')
  .detectLocale(false)
  .scriptName('@mctools/reducer')
  .strict()
  .version()
  .option('mc', {
    alias    : 'm',
    type     : 'string',
    describe : 'Minecraft dir with mods/ and minecaftinstance.json',
    default  : './',
    normalize: true,
    coerce   : assertPath,
  })
  .command({
    command : 'levels <path>',
    describe: 'Select reduce level with prompt',
    builder : ya => ya
      .positional('path', {
        describe    : 'Path to JSON with level detail',
        type        : 'string',
        normalize   : true,
        demandOption: true,
      })
      .coerce('path', (f: string) => {
        assertPath(f)
        const jsonObj: ReduceLevels = JSON.parse(readFileSync(f, 'utf8'))
        return jsonObj
      })
      .option('index', {
        alias   : 'i',
        type    : 'number',
        describe: 'Select reduce level without prompt',
      }),
    handler: async (argv) => {
      await levels(argv.mc, argv.path!, argv.index)
    },
  })
  .command({
    command : 'binary',
    describe: 'Reduce mods in half to find error',
    builder : ya => ya,
    handler : async (argv) => {
      await binary(argv.mc)
    },
  })
  .command({
    command : 'interactive',
    describe: 'Pick mods and manipulate them one by one',
    builder : ya => ya,
    handler : async (argv) => {
      await interactive(argv.mc)
    },
  })
  .parse()
