#!/usr/bin/env node

import yargs from 'yargs'
import { loadConfig } from './config'
import { showTerminal } from '.'

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
    describe : 'Path to configuration JSON',
    type     : 'string',
    default  : '@mctools/run.json',
    normalize: true,
    coerce   : loadConfig,
  })
  .parseSync()

/* ============================================
=                                             =
============================================= */

;(async () => showTerminal(argv))()
