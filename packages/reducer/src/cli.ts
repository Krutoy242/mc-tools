#!/usr/bin/env node

import type { ArgsDef, Resolvable} from 'citty'

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineCommand, runMain } from 'citty'

import { description, name, version } from '../package.json'
import { binary } from './binary'
import { interactive } from './interactive'

function assertPath(f: string, errorText?: string) {
  if (existsSync(f)) return f
  throw new Error(`${resolve(f)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

const cwdArg = {
  cwd: {
    type       : 'string',
    alias      : 'm',
    description: 'Minecraft dir with mods/ and minecaftinstance.json',
    default    : './',
  },
} as Resolvable<ArgsDef>

const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  subCommands: {
    binary: defineCommand({
      meta: {
        name       : 'binary',
        description: 'Reduce mods in half to find error',
      },
      args: cwdArg,
      async run({ args }) {
        assertPath(args.cwd as string)
        await binary(args.cwd as string)
      },
    }),
    interactive: defineCommand({
      meta: {
        name       : 'interactive',
        description: 'Pick mods and manipulate them one by one',
      },
      args: cwdArg,
      async run({ args }) {
        assertPath(args.cwd as string)
        await interactive(args.cwd as string)
      },
    }),
  },
})

runMain(main)
