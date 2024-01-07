#!/usr/bin/env node

import yargs from 'yargs'

import { showTerminal } from '.'
import { loadConfig } from './config'

/* =============================================
=                Arguments                    =
============================================= */

const argv = yargs(process.argv.slice(2))
  .scriptName('@mctools/run')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)
  .option('cwd', {
    alias    : 'w',
    normalize: true,
    describe : 'Working derictory where scripts would be executed',
  })
  .command('$0 [config]', '')
  .positional('config', {
    describe : 'Path to configuration JSON OR package.json/scripts key regexp',
    type     : 'string',
    normalize: true,
    coerce   : loadConfig,
  })
  .parseSync()

/* ============================================
=                                             =
============================================= */

;(async () => showTerminal(argv))()
