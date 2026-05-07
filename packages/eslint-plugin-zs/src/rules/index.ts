import type { LintAdapter } from '@mctools/format'
import type { Rule } from 'eslint'

import { makeZsFormatRule } from './zs-format.js'

export interface PluginContext {
  getAdapter: () => LintAdapter
}

export type RuleFactory = (ctx: PluginContext) => Rule.RuleModule

/**
 * Drop-in registry. Adding a new rule is one line: register a factory here
 * and it auto-appears on the plugin object exposed by `defineConfig`.
 */
export const ruleFactories: Record<string, RuleFactory> = {
  'zs-format': ({ getAdapter }) => makeZsFormatRule(getAdapter),
}

export function buildRules(ctx: PluginContext): Record<string, Rule.RuleModule> {
  return Object.fromEntries(
    Object.entries(ruleFactories).map(([name, mk]) => [name, mk(ctx)])
  )
}
