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
    pause: {
      type       : 'boolean',
      alias      : 'p',
      description: 'Pause before linting',
    },
  },
  async run({ args }) {
    const normalizedFileList = args._.map(f => f.replace(/\\/g, '/'))
    const fileList = await glob(normalizedFileList, {
      dot   : true,
      ignore: args.ignore ? [args.ignore] : [],
    })
    if (!fileList.length) throw new Error(`Files ${String(args._)} doesnt exist. Provide correct path.`)

    const convertResult = convertToTs(fileList).filter(Boolean) as string[]

    if (!convertResult.length) return

    // Convert using jscodeshift
    // process.stdout.write(`refactoring with ${chalk.green('jscodeshift')}...\n`)
    // refactor(convertResult)

    if (!args.pause || !await consola.prompt('Skip linting?', { type: 'confirm' })) {
      // Lint & fix
      try {
        const lintResult = lintFiles(convertResult, args.ignore)
        consola.info(lintResult)
      }
      catch (error: any) {
      // eslint-disable-next-line ts/no-unsafe-member-access
        const errStr = String(error.stdout ?? error)
        const isFatal = !!errStr.match(/\d+\s+error/i)

        if (isFatal) {
          consola.error(`Fatal error during linting.: `, error)
          return
        }

        consola.warn('Have some managable errors during linting.')
      }
    }

    // Revert TS -> ZS
    convertResult.forEach((newFilePath, i) => {
      const linted = readFileSync(newFilePath, 'utf8')
      writeFileSync(fileList[i], revert(linted))
      unlinkSync(newFilePath)
    })
  },
})

void runMain(main)

/* ============================================
=                                             =
============================================= */
function lintFiles(files: string[], ignore: string | undefined) {
  const filesToLint = files.map(f => `"${f.replace(/\\/g, '/')}"`).join(' ')
  const command = `npx eslint --fix --quiet`
    + `${ignore ? ` --ignore-pattern ${ignore}` : ''}`
    + ` ${filesToLint}`
  consola.start('>', command)
  return execSync(command, { stdio: 'inherit' })?.toString().trim() ?? ''
}
