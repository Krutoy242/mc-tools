/**
 * Encapsulates ESLint --fix invocation.
 *
 * `eslint` is a **peer dependency** — never import it at module-evaluation
 * time. Consumers who only need pure helpers (`zsToTs`, `revert`,
 * `formatZsSync` against their own adapter) must be able to load
 * `@mctools/format` without an installed ESLint. All references to `eslint`
 * therefore go through dynamic `import('eslint')` inside async function
 * bodies.
 *
 * Two consumers:
 *   - `lintFilesBatch` — FS batch path used by the `mctools-format` CLI.
 *   - `createBatchAdapter` — `LintAdapter` shape used by external consumers
 *     that want to lint a single TS string with the host's full config
 *     resolution (plugins, presets, ignores) but no FS round-trip.
 */

import type { LintAdapter, LintFixResult } from './lintAdapter.js'
import { performance } from 'node:perf_hooks'

import process from 'node:process'
import { consola } from 'consola'

import { colors } from 'consola/utils'

const formatMs = (ms: number) => colors.gray(` (${ms.toFixed(2)}ms)`)

/**
 * Run `eslint --fix --quiet` on the given files. Applies all auto-fixes and
 * prints any remaining errors via the stylish formatter. Returns the number
 * of unfixable errors so the caller can decide what to do; never throws on
 * lint errors (only on truly unexpected failures from ESLint itself).
 */
export async function lintFilesBatch(
  files  : string[],
  ignore : string | undefined,
  verbose = false
): Promise<number> {
  const { ESLint } = await import('eslint')
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

  return errorResults.reduce((sum, r) => sum + r.errorCount, 0)
}

/**
 * Adapter that lazily creates one `ESLint` instance and reuses it across
 * `fix(...)` calls via `lintText`. Useful when the caller already holds the
 * source in memory (no FS round-trip) but still wants the host's full config
 * resolution (plugins, presets, ignore patterns).
 */
export function createBatchAdapter(
  opts: { ignore?: string } = {}
): LintAdapter {
  // Resolved on first .fix() call; ESLint module load is deferred until then.
  let eslintP: Promise<import('eslint').ESLint> | undefined
  const getInstance = async () => {
    eslintP ??= import('eslint').then(({ ESLint }) => new ESLint({
      fix                    : true,
      ignorePatterns         : opts.ignore ? [opts.ignore] : undefined,
      errorOnUnmatchedPattern: false,
    }))
    return eslintP
  }

  return {
    async fix(tsSource, virtualFilename) {
      const eslint = await getInstance()
      const [result] = await eslint.lintText(tsSource, { filePath: virtualFilename })
      const messages = (result.messages ?? []).map(m => ({
        ruleId   : m.ruleId,
        severity : m.severity,
        message  : m.message,
        line     : m.line,
        column   : m.column,
        endLine  : m.endLine,
        endColumn: m.endColumn,
      }))
      return {
        output    : result.output ?? tsSource,
        errorCount: result.errorCount ?? 0,
        messages,
      } satisfies LintFixResult
    },
  }
}
