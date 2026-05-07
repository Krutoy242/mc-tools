/**
 * Bracket-counted unwinders for the two cast-shaped wrappers the forward pass
 * emits — `__as<Type>(expr)` and `Array<T>`. Both shapes can nest arbitrarily
 * (`__as<Array<int>>(__as<float>(x))`), which defeats the kind of single-pass
 * regex used in `./rules.ts`. Keeping these here means `rules.ts` only has to
 * deal with non-nestable patterns.
 */

import { MARKERS } from '../markers.js'

const CAST_OPEN = `${MARKERS.castFn}<`

/**
 * True if `expr` contains a top-level binary operator. We need parens around
 * such an expr in ZS because `as` binds tighter than `+`/`*`/etc:
 *   `(a + b) as int` ≠ `a + b as int` (the latter is `a + (b as int)`).
 *
 * Only depth-0 operators count — those nested in `()` / `[]` / `{}` already
 * have surrounding parens. Detection is heuristic: a space + operator-char +
 * space is overwhelmingly a binary operator after ESLint's spacing pass.
 */
function castExprNeedsParens(expr: string): boolean {
  let depth = 0
  for (let i = 0; i < expr.length - 2; i++) {
    const c = expr[i]
    if (c === '(' || c === '[' || c === '{') {
      depth++
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      depth--
      continue
    }
    if (depth !== 0 || c !== ' ') continue
    const next = expr[i + 1]
    if (!next || !'+-*/%<>=&|^?:!~'.includes(next)) continue
    let j = i + 2
    while (j < expr.length && '+-*/%<>=&|^?:!~'.includes(expr[j])) j++
    if (expr[j] === ' ') return true
  }
  return false
}

/**
 * Unwind every `Array<...>` wrapper to ZS `[...]`, innermost first. A single
 * regex pass with `Array<(.+?)>` fails on any nesting — the non-greedy `.+?`
 * matches across unrelated `<>` pairs (e.g. `Array<Array<int>[string]>` would
 * partially-match `Array<Array<int>`, leaving the outer `>` stranded). The
 * `[^<>]+` pattern matches only innermost generics, and the loop peels one
 * level at a time until the source is stable.
 */
export function revertLists(source: string): string {
  let out = source
  while (out.includes('Array<')) {
    const next = out.replace(/Array<([^<>]+)>/g, (_m, a: string) => `[${a}]`)
    if (next === out) break // malformed input (e.g. `Array<` without `>`)
    out = next
  }
  return out
}

/**
 * Unwind every `__as<Type>(expr)` wrapper to ZS `expr as Type`, innermost
 * first. Uses explicit bracket counting because angle/paren nesting defeats
 * regex (e.g. `__as<Array<int>>(__as<float>(x))`).
 */
export function revertCasts(source: string): string {
  let out = source
  for (;;) {
    // Innermost wrapper has the largest start index — it cannot contain
    // another `__as<` (otherwise that one would have a larger index).
    const start = out.lastIndexOf(CAST_OPEN)
    if (start === -1) return out

    // Match the generic `<...>`.
    let i = start + CAST_OPEN.length
    let angle = 1
    while (i < out.length && angle > 0) {
      const c = out[i]
      if (c === '<') {
        angle++
      }
      else if (c === '>') {
        angle--
        if (angle === 0) break
      }
      i++
    }
    if (angle !== 0 || out[i + 1] !== '(') return out // malformed; bail

    const type = out.slice(start + CAST_OPEN.length, i).trim()

    // Match the call `(...)`.
    let j = i + 2
    let paren = 1
    while (j < out.length && paren > 0) {
      const c = out[j]
      if (c === '(') {
        paren++
      }
      else if (c === ')') {
        paren--
        if (paren === 0) break
      }
      j++
    }
    if (paren !== 0) return out

    const inner = out.slice(i + 2, j)
    const wrapped = castExprNeedsParens(inner) ? `(${inner})` : inner
    const after = out.slice(j + 1)
    // `as` binds looser than member access / call in ZS, so a cast result
    // followed by `.foo`, `?.foo`, `[…]`, or `(…)` must stay parenthesised —
    // otherwise `(A as B).c` would revert to `A as B.c`, which the ZS parser
    // would read as `A as (B.c)` (TypePath allows `.`).
    const trimmed = after.replace(/^\s+/, '')
    const needsOuter = trimmed.startsWith('.')
      || trimmed.startsWith('[')
      || trimmed.startsWith('(')
      || trimmed.startsWith('?.')
    const replacement = needsOuter
      ? `(${wrapped} as ${type})`
      : `${wrapped} as ${type}`
    out = `${out.slice(0, start)}${replacement}${after}`
  }
}
