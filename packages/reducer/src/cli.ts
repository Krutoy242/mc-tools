#!/usr/bin/env node

import { assertPath } from '@mctools/utils/args'
import { defineCommand, runMain } from 'citty'

import { main } from '.'
import { description, name, version } from '../package.json'

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
