#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import yargs from 'yargs'

import { generateManifest } from './index.js'

const args = yargs(process.argv.slice(2))
  .scriptName('@mctools/manifest')
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
    alias   : 'k',
    type    : 'string',
    describe: 'CurseForge API key or path to file containing it. Get one at https://console.curseforge.com/?#/api-keys. If omitted, environment variable `CF_API_KEY` would be used instead.',
  })
  .option('mcinstance', {
    alias   : 'm',
    describe: 'Path to minecraftinstance.json',
    default : 'minecraftinstance.json',
  })
  .option('name', {
    type    : 'string',
    describe: 'Override pack name (default: autodetect from cwd)',
  })
  .option('mc-version', {
    type    : 'string',
    describe: 'Override Minecraft version (default: autodetect from minecraftinstance.json/debug.log)',
  })
  .option('project-id', {
    type    : 'number',
    describe: 'Override CurseForge project ID (default: read from existing manifest.json)',
  })
  .option('pack-version', {
    type    : 'string',
    describe: 'Pack version to write into manifest',
  })
  .option('postfix', {
    type    : 'string',
    describe: 'Suffix for output file: manifest<postfix>.json',
  })
  .parseSync()

// Resolve API key: --key option (file or direct) or CF_API_KEY env var
if (args.key) {
  // Check if it's a file path
  try {
    const resolvedPath = resolve(args.key)
    if (existsSync(resolvedPath)) {
      args.key = readFileSync(resolvedPath, 'utf8').trim()
    }
  }
  catch {
    // If not a valid path, use args.key as-is (direct API key)
  }
}
else {
  args.key = process.env.CF_API_KEY
}

if (!args.key) {
  console.error('Provide Curse Forge API key with --key cli option or with CF_API_KEY environment variable')
  process.exit(1)
}

if (args.verbose) console.log('- Generating manifest -')
generateManifest(args.mcinstance, {
  ignore     : args.ignore,
  key        : args.key,
  name       : args.name,
  mcVersion  : args['mc-version'],
  projectID  : args['project-id'],
  packVersion: args['pack-version'],
  postfix    : args.postfix,
  verbose    : args.verbose,
}).catch((err: Error) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
