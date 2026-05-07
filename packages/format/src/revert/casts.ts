/**
 * Bracket-counted unwinders for the two cast-shaped wrappers the forward pass
 * emits — `__as<Type>(expr)` and `Array<T>`. Both shapes can nest arbitrarily
 * (`__as<Array<int>>(__as<float>(x))`), which defeats the kind of single-pass
 * regex used in `./rules.ts`. Bracket matching is delegated to `balanced-match`
 * so this file only carries the cast-specific logic (parens around binary
 * inner expressions, parens around member-access tail).
 */

import balanced from 'balanced-match'

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
 * Unwind every `Array<...>` wrapper to ZS `[...]`. `balanced-match` gives us
 * the matching `>` for the leftmost `<`, which handles nesting in one pass —
 * `Array<Array<int>>` rewrites outer-first to `[Array<int>]` and the loop
 * picks up the inner on the next iteration.
 */
export function revertLists(source: string): string {
  let out = source
  for (;;) {
    const idx = out.indexOf('Array<')
    if (idx === -1) return out
    const open = idx + 'Array'.length // position of '<'
    const b = balanced('<', '>', out.slice(open))
    if (!b) return out // malformed (unmatched `<`)
    out = `${out.slice(0, idx)}[${b.body}]${b.post}`
  }
}

/**
 * Unwind every `__as<Type>(expr)` wrapper to ZS `expr as Type`, leftmost
 * first. Each pass uses two `balanced-match` calls — one for the generic
 * `<...>`, one for the call `(...)` — and the loop re-matches inside the
 * rewritten body, so nesting (`__as<Array<int>>(__as<float>(x))`) unwinds
 * cleanly without any custom bracket counting.
 */
export function revertCasts(source: string): string {
  let out = source
  for (;;) {
    const start = out.indexOf(CAST_OPEN)
    if (start === -1) return out

    const angleStart = start + MARKERS.castFn.length // position of '<'
    const angle = balanced('<', '>', out.slice(angleStart))
    if (!angle) return out // malformed; bail

    const callStart = angleStart + angle.end + 1
    if (out[callStart] !== '(') return out

    const paren = balanced('(', ')', out.slice(callStart))
    if (!paren) return out

    const type = angle.body.trim()
    const inner = paren.body
    const wrapped = castExprNeedsParens(inner) ? `(${inner})` : inner
    const after = paren.post
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
