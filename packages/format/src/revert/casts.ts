/* eslint-disable no-irregular-whitespace */
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
/**
 * Walk a string starting with `<` and find its matching `>`, skipping over
 * block comments and the `=>` digraph. Returns the same shape as the bits of
 * `balanced-match` we actually use (`body`, `post`).
 *
 * `balanced-match` is a plain character counter and gets confused by:
 *   - `>` inside block-comment markers like `/​* => *​/` (preserved by the
 *     forward pass to tag function-type return arrows);
 *   - `>` that's the second char of a literal TS `=>` arrow inside a function
 *     type (`__as<(a: T) => U>(x)`).
 * Both shapes appear in real ZS-derived TS as soon as someone casts to a
 * function type, so the cast/list unwinders must see them as opaque.
 *
 * Block comments cannot nest in TS, so the `*​/` lookup is safe; the `=>`
 * skip handles the function-arrow case (a stray `>` paired with no `<` would
 * otherwise drop our depth below zero on the wrong character).
 */
function matchAngle(s: string): { body: string, post: string, end: number } | null {
  if (s[0] !== '<') return null
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      if (end === -1) return null
      i = end + 1
      continue
    }
    if (c === '=' && s[i + 1] === '>') {
      i++
      continue
    }
    if (c === '<') {
      depth++
    }
    else if (c === '>') {
      depth--
      if (depth === 0) return { body: s.slice(1, i), post: s.slice(i + 1), end: i }
    }
  }
  return null
}

function castExprNeedsParens(expr: string): boolean {
  // Op chars excluding `:`. A bare `:` is a TS type annotation
  // (`function (): T`, `function (x: T)`, etc.) — not a binary operator that
  // needs parens around its left operand. The ternary `?:` still trips the
  // heuristic at the `?`.
  const OP = '+-*/%<>=&|^?!~'
  let depth = 0
  for (let i = 0; i < expr.length - 2; i++) {
    const c = expr[i]
    // Skip block comments wholesale: forward markers like `/​* as *​/` and
    // `/​* => *​/` sit between TS tokens and would otherwise be read as op
    // runs by the inner walker (`/`, `*` are op chars).
    if (c === '/' && expr[i + 1] === '*') {
      const end = expr.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 1
      continue
    }
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
    if (!next || !OP.includes(next)) continue
    let j = i + 2
    while (j < expr.length && OP.includes(expr[j])) j++
    if (expr[j] === ' ') return true
  }
  return false
}

/**
 * Unwind every `Array<...>` wrapper to ZS `[...]`. `matchAngle` gives us the
 * matching `>` for the leftmost `<` while skipping block comments and `=>`,
 * which handles nesting in one pass — `Array<Array<int>>` rewrites outer-first
 * to `[Array<int>]` and the loop picks up the inner on the next iteration. The
 * comment/arrow awareness matters once the inner type is a function type
 * (`Array<() => T>`), where a naive counter would mis-close on the `=>`.
 */
export function revertLists(source: string): string {
  let out = source
  for (;;) {
    const idx = out.indexOf('Array<')
    if (idx === -1) return out
    const open = idx + 'Array'.length // position of '<'
    const b = matchAngle(out.slice(open))
    if (!b) return out // malformed (unmatched `<`)
    out = `${out.slice(0, idx)}[${b.body}]${b.post}`
  }
}

/**
 * Unwind every `__as<Type>(expr)` wrapper to ZS `expr as Type`, leftmost
 * first. Each pass pairs a comment-/arrow-aware angle match (`matchAngle`)
 * with a `balanced-match` call for the value parens, and the loop re-matches
 * inside the rewritten body, so nesting (`__as<Array<int>>(__as<float>(x))`)
 * unwinds cleanly without any custom bracket counting. Plain `balanced-match`
 * doesn't fit for the angles because TS function types put `=>` and the
 * forward pass's `/​* => *​/` marker inside cast bodies — both contain a `>`.
 */
export function revertCasts(source: string): string {
  let out = source
  for (;;) {
    const start = out.indexOf(CAST_OPEN)
    if (start === -1) return out

    const angleStart = start + MARKERS.castFn.length // position of '<'
    const angle = matchAngle(out.slice(angleStart))
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
