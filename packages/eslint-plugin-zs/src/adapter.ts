import type { LintAdapter, LintFixResult } from '@mctools/format'
import type { Linter } from 'eslint'

import { Linter as LinterCtor } from 'eslint'

/**
 * In-process `LintAdapter` for use *inside* an ESLint rule.
 *
 * The whole point of this package is to lint `.zs` files using the host's
 * existing flat config without spawning a second `new ESLint(...)` (which
 * would re-resolve plugins, re-read config files, and recurse).
 * `Linter.verifyAndFix` is FS-free, synchronous, and re-entrant — perfect
 * for a rule's `Program:exit` hook.
 *
 * The user is expected to supply (via `defineConfig`) the same flat-config
 * array they use for `*.ts`. We pass it verbatim to the in-process Linter
 * along with a virtual filename ending in `.ts` so the host's TS rules
 * apply.
 */
export function createInProcessAdapter(
  tsConfig: Linter.Config[]
): LintAdapter {
  const linter = new LinterCtor({ configType: 'flat' })
  return {
    fix(tsSource, virtualFilename) {
      const result = linter.verifyAndFix(tsSource, tsConfig, { filename: virtualFilename })
      const messages = result.messages.map(m => ({
        ruleId   : m.ruleId,
        severity : m.severity,
        message  : m.message,
        line     : m.line,
        column   : m.column,
        endLine  : m.endLine,
        endColumn: m.endColumn,
      }))
      const remaining = messages.filter(m => m.severity === 2)
      return {
        output    : result.output,
        errorCount: remaining.length,
        messages,
      } satisfies LintFixResult
    },
  }
}
