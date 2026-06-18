#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import { defineCommand, runMain } from 'citty'

import { generateManifest } from './index.js'

const main = defineCommand({
  meta: {
    name       : '@mctools/manifest',
    description: '`manifest.json` generation tool',
  },
  args: {
    'verbose': {
      type       : 'boolean',
      alias      : 'v',
      description: 'Log working process in stdout',
    },
    'ignore': {
      type       : 'string',
      alias      : 'i',
      description: 'Path to ignore file similar to .gitignore',
    },
    'key': {
      type       : 'string',
      alias      : 'k',
      description: 'CurseForge API key or path to file containing it. Get one at https://console.curseforge.com/?#/api-keys. If omitted, CF_API_KEY env var is used.',
    },
    'mcinstance': {
      type       : 'string',
      alias      : 'm',
      default    : 'minecraftinstance.json',
      description: 'Path to minecraftinstance.json',
    },
    'name': {
      type       : 'string',
      description: 'Override pack name (default: autodetect from cwd)',
    },
    'mc-version': {
      type       : 'string',
      description: 'Override Minecraft version (default: autodetect from minecraftinstance.json/debug.log)',
    },
    'project-id': {
      type       : 'number',
      description: 'Override CurseForge project ID (default: read from existing manifest.json)',
    },
    'pack-version': {
      type       : 'string',
      description: 'Pack version to write into manifest',
    },
    'postfix': {
      type       : 'string',
      description: 'Suffix for output file: manifest<postfix>.json',
    },
  },
  async run({ args }) {
    let key = args.key
    if (key) {
      try {
        const resolvedPath = resolve(key)
        if (existsSync(resolvedPath)) {
          key = readFileSync(resolvedPath, 'utf8').trim()
        }
      }
      catch { /* use key value as-is */ }
    }
    else {
      key = process.env.CF_API_KEY
    }

    if (!key) {
      console.error('Provide Curse Forge API key with --key cli option or with CF_API_KEY environment variable')
      process.exit(1)
    }

    const ignore = args.ignore ? readFileSync(assertPath(args.ignore), 'utf8') : undefined

    if (args.verbose) console.log('- Generating manifest -')
    await generateManifest({
      mcinstancePath: args.mcinstance,
      ignore,
      key,
      name          : args.name,
      mcVersion     : args['mc-version'],
      projectID     : args['project-id'],
      packVersion   : args['pack-version'],
      postfix       : args.postfix,
      verbose       : args.verbose,
      onLog         : args.verbose ? (msg: string) => process.stdout.write(msg) : undefined,
    }).catch((err: Error) => {
      process.stderr.write(`${err.message}\n`)
      process.exit(1)
    })
  },
})

void runMain(main)
