#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'

import { convertToTs, revert } from '.'
import { description, name, version } from '../package.json'

/* =============================================
=                Arguments                    =
============================================= */
const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
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
    ts: {
      type       : 'boolean',
      alias      : 't',
      description: 'Create linted .ts file without converting it back',
      conflicts  : ['nolint'],
    },
    nolint: {
      type       : 'boolean',
      alias      : 'l',
      description: 'Do not lint file',
      conflicts  : ['ts'],
    },
  },
  async run({ args }) {
    const fileList = await glob(args.files.replace(/\\/g, '/'), {
      dot   : true,
      ignore: args.ignore ? [args.ignore] : [],
    })
    if (!fileList.length) throw new Error(`${resolve(args.files)} doesnt exist. Provide correct path.`)

    const convertResult = convertToTs(fileList).filter(Boolean) as string[]

    if (!convertResult.length) return

    // Convert using jscodeshift
    // process.stdout.write(`refactoring with ${chalk.green('jscodeshift')}...\n`)
    // refactor(convertResult)

    if (args.nolint) return

    // Lint & fix
    consola.start('executing ESLint --fix')
    try {
      const lintResult = lintFile(args.files.replace(/\.zs/g, '.ts'), args.ignore)
      consola.info(lintResult)
    }
    catch (error: any) {
      const errStr = (error.stdout ?? error).toString()
      const isFatal = !!errStr.match(/\d+\s+error/i)

      if (isFatal) {
        consola.error(`Fatal error during linting.: `, error)
        return
      }

      consola.warn('Have some managable errors during linting.')
    }

    if (args.ts) return

    // Revert TS -> ZS
    convertResult.forEach((newFilePath, i) => {
      const linted = readFileSync(newFilePath, 'utf8')
      writeFileSync(fileList[i], revert(linted))
      unlinkSync(newFilePath)
    })
  },
})

runMain(main)

/* ============================================
=                                             =
============================================= */
function lintFile(glob: string, ignore: string | undefined) {
  const command = `npx eslint --fix --quiet`
    + `${ignore ? ` --ignore-pattern ${ignore}` : ''}`
    + ` "${glob.replace(/\\/g, '/')}"`
  return execSync(command, { stdio: 'inherit' })?.toString().trim() ?? ''
}
