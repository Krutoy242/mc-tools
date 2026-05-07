/**
 * Reverse pass: TypeScript (post-ESLint) → ZenScript.
 *
 * The forward pass (`peggyParse`) sprinkles the TS source with marker comments
 * (see {@link ./markers.ts}). Here we apply two passes:
 *
 *   1. Bracket-counted unwinders for the wrappers that nest arbitrarily —
 *      `__as<…>(…)` casts and `Array<…>` lists. See {@link ./revert/casts.ts}.
 *   2. A flat, ordered list of regex rewrite rules for everything else. See
 *      {@link ./revert/rules.ts}.
 *
 * Plus a final {@link stripDebris} step to peel the conversion-debris fence
 * back off and unescape ZS string-quote fixups.
 */

import { MARKERS } from './markers.js'
import { revertBranded } from './revert/branded.js'
import { revertCasts, revertLists } from './revert/casts.js'
import { RULES } from './revert/rules.js'

/** Apply the cast/list unwinders followed by every regex rule in order. */
export function tsToZs(source: string): string {
  // Cast wrappers are unwound first (bracket-matched, not regex). After this
  // pass the source contains plain `as Type` again, which the rules below
  // can treat like any other ZS-bound text — type-internal markers such as
  // `Array<...>` are then reverted by LIST. `revertBranded` runs before
  // `revertLists` so an `Array<…>` inside a branded wrapper is still unwound.
  let out = revertLists(revertBranded(revertCasts(source)))
  for (const [, pattern, replacement] of RULES) {
    if (typeof replacement === 'string') {
      out = out.replace(pattern, replacement)
    }
    else {
      out = out.replace(pattern, (...args: unknown[]) => {
        const last = args[args.length - 1]
        const groups = typeof last === 'object' && last !== null
          ? last as Record<string, string>
          : {}
        const fullMatch = args[0] as string
        return replacement(groups, fullMatch)
      })
    }
  }
  return out
}

/**
 * Strip the conversion debris fence and unescape single-quoted strings that
 * contain escaped apostrophes (these came from ZS double-quoted strings that
 * peggy normalises to single quotes).
 *
 * The body pattern `(?:[^'\\]|\\.)*` is the standard JS single-quoted-string
 * body (anything that isn't a quote/backslash, OR a backslash followed by any
 * char). Without it, a greedy `.*` would happily span multiple distinct string
 * literals on the same line — e.g. `'"' + '\''` would match end-to-end and
 * collapse into one mangled blob.
 */
export function stripDebris(zs: string): string {
  const fence = MARKERS.debrisFence
  return zs
    .replace(new RegExp(`\\n*\\/\\/ ${fence}[\\s\\S]+?\\/\\/ ${fence}\\n*`, 'g'), '')
    .replace(/'((?:[^'\\]|\\.)*\\'(?:[^'\\]|\\.)*)'/g, (_m, r: string) => `"${r.replace(/\\'/g, '\'')}"`)
}

/** @deprecated use {@link tsToZs}. Kept for backwards compatibility. */
export const revertTS_to_ZS = tsToZs
