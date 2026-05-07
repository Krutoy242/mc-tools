import type { LintAdapter } from '@mctools/format'
import type { Rule } from 'eslint'

import { formatZsSync } from '@mctools/format'

import { mapBack } from '../sourceMap.js'

/**
 * Whole-file ZS formatting rule.
 *
 * The rule reads the raw ZS source from `context.sourceCode.text`, pushes
 * it through `formatZsSync` (zsToTs → adapter.fix → revert), and emits a
 * single `replaceTextRange([0, text.length], ...)` autofix when the result
 * differs from the input. ESLint rules are synchronous, hence `formatZsSync`.
 *
 * Residual TS-side errors are surfaced as ZS-file diagnostics with v0
 * positioning (TS coordinates passed through `sourceMap.mapBack`, currently
 * a no-op). When the grammar grows a real source map, only `mapBack`
 * changes.
 */
export function makeZsFormatRule(getAdapter: () => LintAdapter): Rule.RuleModule {
  return {
    meta: {
      type    : 'layout',
      fixable : 'code',
      docs    : { description: 'Format .zs via @mctools/format pipeline' },
      schema  : [],
      messages: {
        formatDiff   : 'File is not formatted',
        parseError   : 'ZenScript parse error: {{detail}}',
        residualError: 'Residual TS lint error after fix: {{rule}} — {{message}}',
      },
    },
    create(context) {
      return {
        'Program:exit': () => {
          const text = context.sourceCode.text
          const filename = context.filename ?? '__zs_virtual__.zs'
          const virtualTsFilename = filename.replace(/\.zs$/, '.ts')

          let result
          try {
            result = formatZsSync(text, getAdapter(), virtualTsFilename)
          }
          catch (e) {
            const loc = (e as { location?: { start: { line: number, column: number } } }).location
            context.report({
              loc      : loc?.start ?? { line: 1, column: 0 },
              messageId: 'parseError',
              data     : { detail: (e as Error).message },
            })
            return
          }

          if (result.output !== text) {
            context.report({
              loc      : { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              messageId: 'formatDiff',
              fix      : f => f.replaceTextRange([0, text.length], result.output),
            })
          }

          for (const m of mapBack(result.messages ?? [])) {
            if (m.severity !== 2) continue
            context.report({
              loc      : { line: m.line || 1, column: (m.column ?? 1) - 1 },
              messageId: 'residualError',
              data     : { rule: m.ruleId ?? '<core>', message: m.message },
            })
          }
        },
      }
    },
  }
}
