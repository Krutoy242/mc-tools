#!/usr/bin/env tsx

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import process from 'node:process'

import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { ESLint } from 'eslint'
import { glob } from 'tinyglobby'

import pkg from '../package.json' with { type: 'json' }
import { convertToTs, revert } from './index.js'

const { description, name, version } = pkg

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
        await lintFiles(convertResult, args.ignore)
      }
      catch (error) {
        const err = error as { isFatal?: boolean, message?: string }
        const isFatal = err?.isFatal === true
          || !!String(err?.message ?? error).match(/\d+\s+error/i)

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
async function lintFiles(files: string[], ignore: string | undefined) {
  const normalized = files.map(f => f.replace(/\\/g, '/'))
  consola.start('> eslint --fix --quiet', ignore ? `--ignore-pattern ${ignore}` : '', ...normalized)

  const eslint = new ESLint({
    fix                    : true,
    ignorePatterns         : ignore ? [ignore] : undefined,
    errorOnUnmatchedPattern: false,
  })

  const results = await eslint.lintFiles(normalized)
  await ESLint.outputFixes(results)

  // Filter out warnings (mimic --quiet)
  const errorResults = ESLint.getErrorResults(results)

  const formatter = await eslint.loadFormatter('stylish')
  const output = await formatter.format(errorResults)
  if (output) process.stdout.write(`${output}\n`)

  const errorCount = errorResults.reduce((sum, r) => sum + r.errorCount, 0)
  if (errorCount > 0) {
    const err = new Error(`${errorCount} error${errorCount === 1 ? '' : 's'}`) as Error & { isFatal: boolean }
    err.isFatal = true
    throw err
  }
}
