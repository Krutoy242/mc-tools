/**
 * Encapsulates ESLint --fix invocation.
 *
 * Splitting this out keeps the CLI tiny and testable, and ensures the ESLint
 * version constraint is felt in exactly one place. ESLint is consumed via
 * `peerDependencies` (see package.json) — the host project is expected to
 * bring it (and a config) along.
 */

import { performance } from 'node:perf_hooks'
import process from 'node:process'

import { consola } from 'consola'
import { colors } from 'consola/utils'
import { ESLint } from 'eslint'

const formatMs = (ms: number) => colors.gray(` (${ms.toFixed(2)}ms)`)

export interface LintError extends Error {
  isFatal: boolean
}

/**
 * Run `eslint --fix --quiet` on the given files. Throws a `LintError` with
 * `isFatal === true` if at least one error remains after fixing.
 */
export async function lintFiles(
  files: string[],
  ignore: string | undefined,
  verbose = false
): Promise<void> {
  const normalized = files.map(f => f.replace(/\\/g, '/'))
  consola.start(
    '> eslint --fix --quiet',
    ignore ? `--ignore-pattern ${ignore}` : '',
    ...normalized
  )

  const startInit = performance.now()
  const eslint = new ESLint({
    fix                    : true,
    ignorePatterns         : ignore ? [ignore] : undefined,
    errorOnUnmatchedPattern: false,
  })
  if (verbose) consola.info(`ESLint instance created${formatMs(performance.now() - startInit)}`)

  if (verbose && normalized.length > 0) {
    const startConfig = performance.now()
    // Calculate config for the first file to see how long it takes to load plugins/rules
    await eslint.calculateConfigForFile(normalized[0])
    consola.info(`ESLint config resolved for first file${formatMs(performance.now() - startConfig)}`)
  }

  const startLint = performance.now()
  const results = await eslint.lintFiles(normalized)
  if (verbose) consola.info(`Files linted (actual linting)${formatMs(performance.now() - startLint)}`)

  const startFix = performance.now()
  await ESLint.outputFixes(results)
  if (verbose) consola.info(`Fixes applied${formatMs(performance.now() - startFix)}`)

  // Mimic --quiet: hide warnings, surface only errors.
  const errorResults = ESLint.getErrorResults(results)

  const startFormatter = performance.now()
  const formatter = await eslint.loadFormatter('stylish')
  if (verbose) consola.info(`Formatter loaded${formatMs(performance.now() - startFormatter)}`)

  const output = await formatter.format(errorResults)
  if (output) process.stdout.write(`${output}\n`)

  const errorCount = errorResults.reduce((sum, r) => sum + r.errorCount, 0)
  if (errorCount > 0) {
    const err = new Error(`${errorCount} error${errorCount === 1 ? '' : 's'}`) as LintError
    err.isFatal = true
    throw err
  }
}
