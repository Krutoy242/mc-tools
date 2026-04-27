/**
 * Encapsulates ESLint --fix invocation.
 *
 * Splitting this out keeps the CLI tiny and testable, and ensures the ESLint
 * version constraint is felt in exactly one place. ESLint is consumed via
 * `peerDependencies` (see package.json) — the host project is expected to
 * bring it (and a config) along.
 */

import process from 'node:process'

import { consola } from 'consola'
import { ESLint } from 'eslint'

export interface LintError extends Error {
  isFatal: boolean
}

/**
 * Run `eslint --fix --quiet` on the given files. Throws a `LintError` with
 * `isFatal === true` if at least one error remains after fixing.
 */
export async function lintFiles(files: string[], ignore: string | undefined): Promise<void> {
  const normalized = files.map(f => f.replace(/\\/g, '/'))
  consola.start(
    '> eslint --fix --quiet',
    ignore ? `--ignore-pattern ${ignore}` : '',
    ...normalized
  )

  const eslint = new ESLint({
    fix                    : true,
    ignorePatterns         : ignore ? [ignore] : undefined,
    errorOnUnmatchedPattern: false,
  })

  const results = await eslint.lintFiles(normalized)
  await ESLint.outputFixes(results)

  // Mimic --quiet: hide warnings, surface only errors.
  const errorResults = ESLint.getErrorResults(results)

  const formatter = await eslint.loadFormatter('stylish')
  const output = await formatter.format(errorResults)
  if (output) process.stdout.write(`${output}\n`)

  const errorCount = errorResults.reduce((sum, r) => sum + r.errorCount, 0)
  if (errorCount > 0) {
    const err = new Error(`${errorCount} error${errorCount === 1 ? '' : 's'}`) as LintError
    err.isFatal = true
    throw err
  }
}
