#!/usr/bin/env tsx

import process from 'node:process'
import chalk from 'chalk'
import { defineCommand, runMain } from 'citty'

import { findModSource } from './index.js'

const main = defineCommand({
  meta: {
    name       : '@mctools/source',
    description: 'Locate, clone or decompile the source code of a Minecraft 1.12.2 mod.\nThe resolved absolute path is printed to stdout; diagnostics go to stderr.',
  },
  args: {
    query: {
      type       : 'positional',
      description: 'Mod id, name, or jar filename fragment',
      required   : true,
    },
    mc: {
      type       : 'string',
      alias      : 'm',
      description: 'Minecraft instance directory (default: cwd)',
    },
    sources: {
      type       : 'string',
      alias      : 's',
      description: 'Directory holding mod sources (default: $MOD_SOURCES)',
    },
    key: {
      type       : 'string',
      alias      : 'k',
      description: 'CurseForge API key (default: $CF_API_KEY)',
    },
    silent: {
      type       : 'boolean',
      description: 'Suppress diagnostic logging',
    },
  },
  async run({ args }) {
    const path = await findModSource(args.query, {
      mcDir     : args.mc,
      modSources: args.sources,
      cfApiKey  : args.key,
      silent    : args.silent,
    }).catch((e: unknown) => {
      process.stderr.write(`${chalk.red(e instanceof Error ? e.message : String(e))}\n`)
      process.exit(1)
    })
    if (!path) process.exit(1)
    process.stdout.write(`${path}\n`)
  },
})

void runMain(main)
