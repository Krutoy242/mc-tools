import type { LintAdapter } from '@mctools/format'
import type { Linter } from 'eslint'

import { createInProcessAdapter } from './adapter.js'
import { zsParser } from './parser.js'
import { buildRules } from './rules/index.js'

export interface ZsPluginOptions {
  /**
   * Flat config array describing how *.ts files should be linted. The plugin
   * reuses this exact config to lint the marker-laden TS produced from .zs
   * sources — that's the whole reason no second `new ESLint(...)` is needed.
   */
  tsConfig: Linter.Config[]
}

/**
 * Recommended user-facing factory: returns a flat-config fragment that
 * registers the plugin, the parser, and the `zs-format` rule for `**\/*.zs`.
 *
 * ```js
 * import zs from '@mctools/eslint-plugin-zs'
 * export default [...tsConfig, ...zs.defineConfig({ tsConfig })]
 * ```
 */
export function defineConfig(options: ZsPluginOptions): Linter.Config[] {
  let cached: LintAdapter | undefined
  const getAdapter = () => cached ??= createInProcessAdapter(options.tsConfig)

  const plugin = {
    meta : { name: '@mctools/eslint-plugin-zs', version: '0.0.0' },
    rules: buildRules({ getAdapter }),
  }

  return [
    {
      files          : ['**/*.zs'],
      languageOptions: { parser: zsParser },
      plugins        : { '@mctools/zs': plugin },
      rules          : { '@mctools/zs/zs-format': 'error' },
    },
  ]
}

/**
 * Raw plugin export for advanced users who want to compose their own configs.
 * The rules live behind a `getAdapter` thunk so callers must wire a real
 * adapter via `defineConfig` (or the registry directly) before use.
 */
export const plugin = {
  meta: { name: '@mctools/eslint-plugin-zs', version: '0.0.0' },
}

export { createInProcessAdapter } from './adapter.js'
export { zsParser } from './parser.js'
export { buildRules, ruleFactories } from './rules/index.js'

export default { defineConfig, plugin }
