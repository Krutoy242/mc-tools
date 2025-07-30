#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'

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
    const normalizedFileList = args._.map(f => f.replace(/\\/g, '/'))
    const fileList = await glob(normalizedFileList, {
      dot   : true,
      ignore: args.ignore ? [args.ignore] : [],
    })
    if (!fileList.length) throw new Error(`Files ${args._} doesnt exist. Provide correct path.`)

    const convertResult = convertToTs(fileList).filter(Boolean) as string[]

    if (!convertResult.length) return

    // Convert using jscodeshift
    // process.stdout.write(`refactoring with ${chalk.green('jscodeshift')}...\n`)
    // refactor(convertResult)

    if (args.nolint) return

    // Lint & fix
    try {
      const tsFileList = normalizedFileList.map(f => f.replace(/\.zs/g, '.ts'))
      for (const file of tsFileList) {
        const lintResult = lintFile(file, args.ignore)
        consola.info(lintResult)
      }
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
  consola.start('>', command)
  return execSync(command, { stdio: 'inherit' })?.toString().trim() ?? ''
}
