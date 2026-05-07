/**
 * Reverse pass: TypeScript (post-ESLint) → ZenScript.
 *
 * The forward pass (`peggyParse`) sprinkles the TS source with marker comments
 * (see {@link ./markers.ts}). Here we recognise those markers via regex and
 * map the surrounding tokens back to ZS syntax.
 *
 * Why regex instead of an AST pass: the markers are deliberately positioned
 * so that simple (but disciplined) regex rewriting is sufficient and stays
 * fast. Each rule has a single, narrow responsibility — when in doubt, prefer
 * adding a new marker in the grammar over a wider regex here.
 */

import {
  ANON_ARG_PREFIX,
  FN_TO_POSTFIX,
  MARKERS,
  POSTFIX_TO_FN,
  RESERVED_PREFIX,
  RESERVED_WORDS,
} from './markers.js'

// -----------------------------------------------------------------------------
// Cast revert (bracket-matching, not regex)
// -----------------------------------------------------------------------------

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
    // Confirm operator is followed by whitespace (rules out e.g. `->` style).
    let j = i + 2
    while (j < expr.length && '+-*/%<>=&|^?:!~'.includes(expr[j])) j++
    if (expr[j] === ' ') return true
  }
  return false
}

/**
 * Unwind every `__as<Type>(expr)` wrapper to ZS `expr as Type`, innermost
 * first. Uses explicit bracket counting because angle/paren nesting defeats
 * regex (e.g. `__as<Array<int>>(__as<float>(x))`).
 */
function revertCasts(source: string): string {
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
    out = `${out.slice(0, start)}${wrapped} as ${type}${out.slice(j + 1)}`
  }
}

// -----------------------------------------------------------------------------
// Regex building blocks
// -----------------------------------------------------------------------------

const NUMBER = String.raw`-?\d+(?:\.\d+)?`
const POSTFIX_FN_NAMES = Object.values(POSTFIX_TO_FN).join('|')
const RESERVED = RESERVED_WORDS.join('|')

/** Escape a literal block-comment marker for use in a regex. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Drop a single outer pair of parentheses if (and only if) it wraps the whole
 * string with no escaping into nested groups. The forward pass routinely
 * writes `(expr).entries()` for ZS `for x, y in expr`; the original source
 * almost never had those parens, so stripping them keeps the round-trip clean.
 */
function stripOuterParens(s: string): string {
  if (s.length < 2 || s[0] !== '(' || s[s.length - 1] !== ')') return s
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') {
      depth++
    }
    else if (s[i] === ')') {
      depth--
      if (depth === 0 && i !== s.length - 1) return s
    }
  }
  return s.slice(1, -1)
}

const M_CLASS    = esc(MARKERS.classMember)
const M_CLASSFN  = esc(MARKERS.classFn)
const M_VAR      = esc(MARKERS.varKind)
const M_STATIC   = esc(MARKERS.staticConst)
const M_GLOBAL   = esc(MARKERS.globalConst)
const M_CONCAT   = esc(MARKERS.concat)
const M_HAS      = esc(MARKERS.hasOp)
const M_AS       = esc(MARKERS.asCast)
const M_ARROW    = esc(MARKERS.fnArrow)
const M_DEBRIS   = esc(MARKERS.debrisGap)
const M_MIXINEND = esc(MARKERS.mixinEnd)

// -----------------------------------------------------------------------------
// Conversion table
// -----------------------------------------------------------------------------

type GroupReplace = (groups: Record<string, string>, fullMatch: string) => string
type Rule = readonly [name: string, pattern: RegExp, replace: string | GroupReplace]

/**
 * Order matters: e.g. CONCAT_TEMPLATE is a fallback after CONCAT, the
 * class-member family is decoded before any generic var-kind marker, etc.
 */
const RULES: Rule[] = [
  // --- Class declaration / members -----------------------------------------
  ['CLASS',          /class(\s+\w+(?:\s+extends\s+\w+)?\s*\{)/g, 'zenClass$1'],
  ['CLASS_VAL',      new RegExp(`${M_CLASS}\\s*readonly`, 'g'), 'val'],
  ['CLASS_STATIC',   new RegExp(`${M_CLASS}\\s*static`, 'g'), 'static'],
  ['CLASS_VAR',      new RegExp(`${M_CLASS}\\s?`, 'g'), 'var '],
  ['CLASS_FUNCTION', new RegExp(M_CLASSFN, 'g'), 'function'],

  // --- Anonymous functions --------------------------------------------------
  ['ANON_FN_ARROW', new RegExp(`${M_ARROW}\\s?=>\\s?`, 'g'), ''],
  ['ANON_FN_ARGS',  new RegExp(`\\s?${ANON_ARG_PREFIX}\\d+\\s*:\\s?`, 'g'), ''],

  // --- Top-level functions: peggy emits `export function`, ZS has no export -
  ['EXPORT_FN', /^(\s*)export function/gm, '$1function'],

  // --- Preprocessors --------------------------------------------------------
  ['PREPROCESSORS', /^import '#preprocessor (.*)';?$/gm, '#$1'],
  ['IMPORTS',    /import(?: type)? (?<name>[^ ]+) from '(?<from>[^']+)';/g,    ({ from, name }) => `import ${from.replace(/^\.+\//gm, '')}${
    name !== from.split('.').pop() ? ` as ${name}` : ''
  };`],

  // --- Captures (`<...>`) and number postfixes -----------------------------
  ['CAPTURES', /\$`(?<cap>[^`]+)`/g, ({ cap }) => `<${cap}>`],
  ['NUMBER_POSTFIX',    new RegExp(`(?<p>${POSTFIX_FN_NAMES})\\((?<num>${NUMBER})\\)`, 'g'),    ({ p, num }) => num + FN_TO_POSTFIX[p]],

  // --- Loops ---------------------------------------------------------------
  ['FOR_TO',    /for \(let (?<v>[^=\s]+)\s*=\s*(?<from>[^;\s]+(?:\s+[^;\s]+)*)\s*;\s*\k<v>\s*<\s*(?<to>[^;\s]+(?:\s+[^;\s]+)*)\s*;\s*\k<v>\+\+\)\s*\{/g,    ({ v, from, to }) =>
    `for ${v} in ${/[^.\w()[\]?]/.test(from) ? `(${from})` : from} .. ${to} {`],
  ['FOR_IN_PAIR',    /for \(const \[(?<v>[^\]]+)\] of (?<from>[\s\S]+?)\.entries\(\)\/\*\*\/\)\s*\{/g,    ({ v, from }) => `for ${v} in ${stripOuterParens(from.trim())} {`],
  ['FOR_IN',    /for \(const (?<v>\S+) of (?<from>[\s\S]+?)\)\s*\{/g,    ({ v, from }) => `for ${v} in ${stripOuterParens(from.trim())} {`],

  // --- `static`/`global` constants reverted with their original keyword ----
  ['STATICS_KEYWORDS',    new RegExp(`(?:${M_STATIC}|${M_GLOBAL})\\s*const`, 'g'),    (_groups, match) => match.includes('global') ? 'global' : 'static'],

  // --- Misc syntax sugar ---------------------------------------------------
  ['REMOVE_DEBRIS_GAP', new RegExp(`${M_DEBRIS}\\s*.`, 'g'), ''],
  ['WHILE_LOOP',        /while \((.+)\) \{/g, 'while $1 {'],
  ['CONCAT',    new RegExp(`(?<a>\\s*)${M_CONCAT}(?<b>\\s*)\\+|\\+(?<c>\\s*)${M_CONCAT}(?<d>\\s*)`, 'g'),    ({ a, b, c, d }) => `${a || b || ''}~${c || d || ''}`],
  ['CONCAT_TEMPLATE', new RegExp(`\\s*${M_CONCAT}\\s*`, 'g'), ''],
  ['HAS',             new RegExp(`${M_HAS}s*in`, 'g'), 'has'],
  ['ORDERLY',         /\/\*\s*(\$\w+)\s*\*\//g, '$1'],
  ['CAST_REVERT',     new RegExp(`(\\s:|:\\s)${M_AS}(\\s*)`, 'g'), ' as$2'],
  ['RESERVED',    new RegExp(`${esc(RESERVED_PREFIX)}(${RESERVED})`, 'g'),    '$1'],
  ['CONST', new RegExp(`${M_VAR}const`, 'g'), 'val'],
  ['LET',   new RegExp(`${M_VAR}let`, 'g'), 'var'],

  // `Array<X>` → `[X]`
  ['LIST', /Array<(?<a>.+?)>/g, ({ a }) => `[${a}]`],

  // Decorators: `@foo()` → `#foo`, `@foo.bar(body)` → `#foo bar body`
  ['DECORATOR',    /@(?<a>\w+(?:\.\w+)*)\(\s*\)/g,    ({ a }) => `#${a.split('.').join(' ')}`],
  ['DECORATOR_OBJ',    new RegExp(
    `(?<s>[ \\t]*)@(?<a>\\w+(?:\\.\\w+)*)\\((?<b>[\\s\\S]*?)\\)\\s*${M_MIXINEND}`,
    'g'
  ),    ({ s, a, b }) => {
    const head = `${s}#${a.split('.').join(' ')} `
    const indented = b.includes('\n') ? `\n${s}#` : ''
    const reflowed = b.replace(/\n(\s*)/g, (_, m: string) =>
      `\n${s}#${m.substring(s.length)}`)
    return `${head}${indented}${reflowed}`
  }],
]

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/** Apply all reverse rules in order. */
export function tsToZs(source: string): string {
  // Cast wrappers are unwound first (bracket-matched, not regex). After this
  // pass the source contains plain `as Type` again, which the rules below
  // can treat like any other ZS-bound text — type-internal markers such as
  // `Array<...>` and `/* $tag */` are then reverted by LIST/ORDERLY etc.
  let out = revertCasts(source)
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
 */
export function stripDebris(zs: string): string {
  const fence = MARKERS.debrisFence
  return zs
    .replace(new RegExp(`\\n*\\/\\/ ${fence}[\\s\\S]+?\\/\\/ ${fence}\\n*`, 'g'), '')
    .replace(/'(.*\\'.*)'/g, (_m, r: string) => `"${r.replace(/\\'/g, '\'')}"`)
}

/** @deprecated use {@link tsToZs}. Kept for backwards compatibility. */
export const revertTS_to_ZS = tsToZs
