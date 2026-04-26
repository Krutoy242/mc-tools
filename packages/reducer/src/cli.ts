#!/usr/bin/env tsx

import { assertPath } from '@mctools/utils/args'
import { defineCommand, runMain } from 'citty'

import pkg from '../package.json' with { type: 'json' }
import { main } from './index.js'

const { description, name, version } = pkg

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
