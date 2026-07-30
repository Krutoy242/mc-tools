#!/usr/bin/env tsx

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { defineCommand, runMain } from 'citty'

import { DEFAULT_CONFIG, run } from './runner.js'

export const main = defineCommand({
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
    unused: {
      type       : 'boolean',
      alias      : 'u',
      description: 'List into stderr every ignore rule that never matched, with its config line',
    },
  },
  async run({ args }) {
    try {
      process.exitCode = await run({
        log   : args.log,
        config: args.config,
        output: args.output,
        unused: args.unused,
      })
    }
    catch (err) {
      process.stderr.write(`${(err as Error).message}\n`)
      process.exitCode = 2
    }
  },
})

const isMain = process.argv[1] && realpathSync(resolve(fileURLToPath(import.meta.url))) === realpathSync(resolve(process.argv[1]))
if (isMain) {
  runMain(main).catch((err: unknown) => {
    process.stderr.write(`${(err as Error).message}\n`)
    process.exitCode = 2
  })
}
