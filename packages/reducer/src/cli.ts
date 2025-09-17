#!/usr/bin/env node

import { existsSync } from 'node:fs'

import { defineCommand, runMain } from 'citty'
import { resolve } from 'pathe'

import { main } from '.'
import { description, name, version } from '../package.json'

function assertPath(f: string, errorText?: string) {
  const file = resolve(f)
  if (existsSync(file)) return file
  throw new Error(`${resolve(file)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

const mainCli = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  args: {
    cwd: {
      type       : 'string',
      alias      : 'm',
      description: 'Minecraft dir with mods/ and minecaftinstance.json',
      default    : './',
    },
  },
  async run({ args }) {
    await main(assertPath(args.cwd))
  },
})

void runMain(mainCli)
