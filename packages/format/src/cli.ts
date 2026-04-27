#!/usr/bin/env tsx
/**
 * `mctools-format` CLI: ZS → TS → ESLint --fix → ZS.
 *
 * The CLI's only job is to:
 *   1. resolve glob inputs;
 *   2. run the forward conversion (ZS → marker-laden TS);
 *   3. run ESLint --fix on the produced .ts;
 *   4. revert the linted TS back to ZS.
 *
 * All conversion logic lives in `index.ts` / `formatFile.ts` / `tsToZs.ts`.
 */

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'

import pkg from '../package.json' with { type: 'json' }
import { lintFiles } from './eslintRunner.js'
import { convertToTs, isFailure } from './formatFile.js'
import { revert } from './index.js'

const { description, name, version } = pkg

const main = defineCommand({
  meta: { name, version, description },
  args: {
    files: {
      type       : 'positional',
      description: 'Path to file / files for formatting',
      required   : true,
    },
    ignore: {
      type       : 'string',
      alias      : 'i',
      description: 'Same as --ignore-pattern for ESLint',
    },
    pause: {
      type       : 'boolean',
      alias      : 'p',
      description: 'Pause and ask before linting',
    },
  },
  async run({ args }) {
    const normalizedFileList = args._.map(f => f.replace(/\\/g, '/'))
    const fileList = await glob(normalizedFileList, {
      dot   : true,
      ignore: args.ignore ? [args.ignore] : [],
    })
    if (!fileList.length) {
      throw new Error(`Files ${String(args._)} doesnt exist. Provide correct path.`)
    }

    // 1. Forward conversion (ZS → TS). Keeps src↔dst correspondence so the
    //    reverse pass cannot rewrite the wrong file.
    const outcomes = convertToTs(fileList)
    const forwards = outcomes.filter(o => !isFailure(o) && o.kind === 'forward') as
      Array<{ src: string, dst: string, kind: 'forward' }>

    if (forwards.length === 0) return

    const tsPaths = forwards.map(o => o.dst)

    // 2. ESLint --fix
    const skip = args.pause
      ? await consola.prompt('Skip linting?', { type: 'confirm' })
      : false
    if (!skip) {
      try {
        await lintFiles(tsPaths, args.ignore)
      }
      catch (error) {
        const err = error as { isFatal?: boolean, message?: string }
        const isFatal = err.isFatal === true
          || !!String(err.message ?? error).match(/\d+\s+error/i)
        if (isFatal) {
          consola.error(`Fatal error during linting: `, error)
          return
        }
        consola.warn('Have some manageable errors during linting.')
      }
    }

    // 3. Reverse conversion (TS → ZS).
    for (const { src, dst } of forwards) {
      const linted = readFileSync(dst, 'utf8')
      writeFileSync(src, revert(linted))
      unlinkSync(dst)
    }
  },
})

void runMain(main)
