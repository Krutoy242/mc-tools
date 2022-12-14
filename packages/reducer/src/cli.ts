#!/usr/bin/env node

import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import yargs from 'yargs'

import type { ReduceLevels } from './levels'
import { levels } from './levels'
import { binary } from './binary'

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
  .scriptName('mct-reducer')
  .strict()
  .version()
  .option('mods', {
    alias    : 'm',
    type     : 'string',
    describe : 'Minecraft mods/ folder path',
    default  : 'mods',
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
    handler: (argv) => {
      levels(argv.mods, argv.path!, argv.index)
    },
  })
  .command({
    command : 'binary',
    describe: 'Reduce mods in half to find error',
    builder : ya => ya,
    handler : (argv) => {
      binary(argv.mods)
    },
  })
  .parseSync()
