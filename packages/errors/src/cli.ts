#!/usr/bin/env tsx

import process from 'node:process'

import { defineCommand, runMain } from 'citty'

import { DEFAULT_CONFIG, run } from './runner.js'

const main = defineCommand({
  meta: {
    name       : '@mctools/errors',
    description: 'Scan debug.log file to find unknown errors',
  },
  args: {
    output: {
      type       : 'string',
      alias      : 'o',
      description: 'Path for output with errors. If not specified output into stdout.',
    },
    log: {
      type       : 'string',
      alias      : 'l',
      default    : 'logs/debug.log',
      description: 'debug.log file path (may need to be enabled by launcher)',
    },
    config: {
      type       : 'string',
      alias      : 'c',
      default    : DEFAULT_CONFIG,
      description: 'Path to .yml file with configs',
    },
  },
  async run({ args }) {
    try {
      process.exitCode = await run({
        log   : args.log,
        config: args.config,
        output: args.output,
      })
    }
    catch (err) {
      process.stderr.write(`${(err as Error).message}\n`)
      process.exitCode = 2
    }
  },
})

runMain(main).catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`)
  process.exitCode = 2
})
