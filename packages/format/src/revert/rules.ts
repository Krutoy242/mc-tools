/**
 * Regex-driven rewrite rules for the reverse pass. Each rule is a single,
 * narrow responsibility — when in doubt, prefer adding a new marker in the
 * grammar over a wider regex here. Order matters (e.g. CONCAT_TEMPLATE is a
 * fallback after CONCAT, the class-member family is decoded before any
 * generic var-kind marker).
 *
 * The bracket-matched cast/list unwinders live in `./casts.ts`; this file
 * only contains rules that are safe as a single regex pass.
 */

import {
  ANON_ARG_PREFIX,
  FN_TO_POSTFIX,
  MARKERS,
  POSTFIX_TO_FN,
  RESERVED_PREFIX,
  RESERVED_WORDS,
  ZS_KEYWORDS,
} from '../markers.js'

// -----------------------------------------------------------------------------
// Regex building blocks
// -----------------------------------------------------------------------------

const NUMBER = String.raw`-?\d+(?:\.\d+)?`
const POSTFIX_FN_NAMES = Object.values(POSTFIX_TO_FN).join('|')
const RESERVED = RESERVED_WORDS.join('|')
// Bare ZS keywords would re-tokenise after unquoting (e.g. `function` would
// start a function declaration), so UNQUOTE_KEY must skip them. Sort
// long-first to keep the alternation prefix-safe (e.g. `zenClass` before
// `zen…`-shaped substrings); the trailing `\b` is implicit because the
// surrounding regex already ends the key with a closing quote.
const ZS_KEYWORDS_ALT = [...ZS_KEYWORDS]
  .sort((a, b) => b.length - a.length)
  .join('|')

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
export type Rule = readonly [name: string, pattern: RegExp, replace: string | GroupReplace]

export const RULES: Rule[] = [
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

  // --- Object keys: unquote forced-quoted numeric/identifier keys ----------
  // ESLint's `quote-props: consistent-as-needed` propagates quoting to every
  // key in an object as soon as one of them needs it (e.g. a negative-numeric
  // ZS key like `-1`, which TS rejects as a bare property name). Stripping
  // the quotes back here is uniform per line (always 2 chars), so the
  // `key-spacing` alignment ESLint computed in TS survives revert intact.
  // True string keys (containing characters that aren't valid in a numeric
  // or identifier name, e.g. `'foo bar'`) don't match and stay quoted.
  // Anchored to `[{,]` lookbehind so we never unquote a string in non-key
  // position (ternary `: 'foo'`, array `['foo']`, etc.).
  // The `(?!(?:keyword)')` negative lookahead keeps ZS reserved words quoted —
  // `'function'` etc. parse fine as ZS PropertyName via the StringLiteral
  // production but, once unquoted, the upstream ZS runtime re-tokenises them
  // as the keyword (a bare `function:` reads as a declaration head).
  ['UNQUOTE_KEY',    new RegExp(`(?<pre>[{,])(?<ws>\\s*)'(?!(?:${ZS_KEYWORDS_ALT})')(?<key>-?\\d+(?:\\.\\d+)?|[a-z_]\\w*)'(?=\\s*:)`, 'gi'),    ({ pre, ws, key }) => `${pre}${ws}${key}`],

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
  ['CAST_REVERT',     new RegExp(`(\\s:|:\\s)${M_AS}(\\s*)`, 'g'), ' as$2'],
  ['RESERVED',    new RegExp(`${esc(RESERVED_PREFIX)}(${RESERVED})`, 'g'),    '$1'],
  ['CONST', new RegExp(`${M_VAR}const`, 'g'), 'val'],
  ['LET',   new RegExp(`${M_VAR}let`, 'g'), 'var'],

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
