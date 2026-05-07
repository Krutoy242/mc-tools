/**
 * ZS ↔ TS marker protocol.
 *
 * The Peggy grammar (`zenscript.peggy`) emits a TypeScript file enriched with
 * special inline comments and identifier prefixes that survive ESLint's `--fix`
 * pass and are then translated back to ZenScript by {@link revert}.
 *
 * Both the forward (Peggy) and reverse (regex) passes must agree on the exact
 * string spelling of every marker — keep that contract here in one place.
 *
 * Types of markers:
 *   - **Comment markers**: such as `class`, `$`, `~` (written as block comments
 *     in the emitted TS) — used as out-of-band tags inside otherwise valid TS
 *     so that ESLint cannot accidentally drop them (single-line comments could
 *     be stripped by some
 *     formatting rules; block comments are kept).
 *   - **Identifier markers**: `_$_<reserved>` (escapes ZS reserved words that
 *     are also valid JS keywords like `default`/`class`/`case`), `_arg<N>`
 *     (synthetic parameter names in function-type signatures).
 *   - **Numeric postfix**: `__float(...)` etc. — declared as TS functions in
 *     the conversion preamble, reverted to `0.5f`/`0.5d`/...
 *   - **Debris block**: a `// CONVERSION_DEBRIS` fence wrapping eslint-disable
 *     directives and `declare`/`type` stubs that are stripped during revert.
 */

export const MARKERS = {
  // Variable kinds (forward pass writes `/* $ */let|const`, etc.)
  varKind    : '/* $ */',
  classMember: '/* class */',
  classFn    : '/* function */',
  staticConst: '/* static */',
  globalConst: '/* global */',

  // Operators / syntax sugar
  concat   : '/* ~ */', // ZS `~` and `~=`
  hasOp    : '/* has */', // ZS `has`
  asCast   : '/* as */', // ZS `as Type`
  fnArrow  : '/* => */', // function-type return arrow
  debrisGap: '/* _ */', // helper to keep token boundaries sane

  // Mixin block end sentinel
  mixinEnd: '/* MIXIN_END */',

  // Type-cast wrapper. Forward pass emits `__as<Type>(expr)` for every ZS
  // `expr as Type`; revert unwinds it via balanced bracket matching (see
  // `revertCasts` in `tsToZs.ts`). Using a function call instead of a TS
  // `as` assertion keeps ESLint rules like `no-unnecessary-type-assertion`
  // from stripping casts that are runtime-meaningful in ZS.
  castFn: '__as',

  // Branded type wrapper. Forward pass emits `__$suffix<T>` for every ZS
  // `T$suffix` (e.g. `string[string]$orderly`); revert unwinds it via
  // balanced bracket matching (see `revertBranded` in `revert/branded.ts`).
  // `$` cannot start a ZS identifier, so this prefix is unambiguous; a
  // synthetic generic survives ESLint's spacing/comment-stripping passes.
  brandedTypePrefix: '__$',

  // Keyword-as-property-key escape. A ZS keyword used as an object key
  // (`'function': v`) would be unquoted by ESLint's
  // `quote-props: consistent-as-needed` because reserved words are valid
  // bare property names in JS. The upstream ZS runtime, however, reads a
  // bare `function:` as the start of a function declaration. The forward
  // pass therefore swaps the StringLiteral form for `_$_kw_function: v` —
  // a synthetic identifier ESLint sees as an ordinary key — and the
  // QUOTED_KEYWORD_KEY revert rule restores the quotes.
  keywordKeyPrefix: '_$_kw_',

  // Debris fence
  debrisFence: 'CONVERSION_DEBRIS',
} as const

/**
 * Preamble prepended to every forward-pass output: a `// CONVERSION_DEBRIS`
 * fenced block of eslint-disable pragmas plus `declare` stubs for the synthetic
 * helpers (`__float`, `__as`, ...) and ZS globals (`recipes`, `mods`, ...) that
 * the marker protocol references. ESLint must see these as legitimate TS so it
 * does not flag the marker-laden output; the reverse pass strips the fenced
 * region in `stripDebris`.
 */
export const DEBRIS_PREAMBLE = `

// ${MARKERS.debrisFence}
// =============================================================
/* eslint max-statements-per-line: "warn" */
/* eslint style/no-multi-spaces: ["error", { ignoreEOLComments: true, exceptions: { "VariableDeclarator": true, "ArrayExpression": true }}] */
/* eslint style/quote-props: ["warn", "consistent-as-needed"] */
/* eslint style/semi: ["error", "always"] */
/* eslint-disable antfu/consistent-list-newline */
/* eslint-disable curly */
/* eslint-disable dot-notation */
/* eslint-disable eqeqeq */
/* eslint-disable import/first */
/* eslint-disable no-unreachable-loop */
/* eslint-disable no-var */
/* eslint-disable object-shorthand */
/* eslint-disable perfectionist/sort-imports */
/* eslint-disable prefer-arrow-callback */
/* eslint-disable prefer-template */
/* eslint-disable style/indent-binary-ops */
/* eslint-disable style/max-statements-per-line */
/* eslint-disable style/no-multi-spaces */
/* eslint-disable ts/consistent-type-imports */
/* eslint-disable ts/no-dupe-class-members */
/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/no-unsafe-assignment */
/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-return */
/* eslint-disable ts/no-use-before-define */
/* eslint-disable ts/restrict-plus-operands */
/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable vars-on-top */

declare type int = number & { readonly __brand: 'int' };
declare type byte = number & { readonly __brand: 'byte' };
declare type float = number & { readonly __brand: 'float' };
declare type double = number;
declare type short = number & { readonly __brand: 'short' };
declare type long = number & { readonly __brand: 'long' };
declare type bool = boolean;
declare function __float(n: number): float;
declare function __double(n: number): number;
declare function __byte(n: number): byte;
declare function __short(n: number): short;
declare function __long(n: number): long;
declare function __as<T>(value: any): T;
declare function $(s: any): any;
declare function isNull(o: any): boolean;
declare const recipes: Record<string, any>;
declare const mods: Record<string, any>;
declare const craft: Record<string, any>;
declare const scripts: Record<string, any>;
declare const furnace: Record<string, any>;
declare const itemUtils: Record<string, any>;
declare const oreDict: Record<string, any>;
declare const game: Record<string, any>;
declare const crafttweaker: any;
declare const events: any;
declare const mixin: any;
declare const native: any;
// =============================================================
// ${MARKERS.debrisFence}

`

/**
 * Numeric postfixes: ZS allows `1.0f` / `42L`. We rewrite to `__float(1.0)`,
 * `__long(42)` etc. — calls of declared no-op functions that survive ESLint
 * untouched and are easy to revert.
 */
export const POSTFIX_TO_FN: Readonly<Record<string, string>> = {
  f: '__float',
  d: '__double',
  b: '__byte',
  s: '__short',
  l: '__long',
}

export const FN_TO_POSTFIX: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(POSTFIX_TO_FN).map(([k, v]) => [v, k])
)

/** Reserved JS words escaped in ZS identifiers. */
export const RESERVED_PREFIX = '_$_'
export const RESERVED_WORDS = ['default', 'class', 'case'] as const

/** Anonymous parameter prefix for function-type signatures (e.g. `_arg0`). */
export const ANON_ARG_PREFIX = '_arg'

/**
 * ZS reserved words. The Peggy grammar lets `PropertyName → IdentifierName`
 * accept these as bare object keys, but the upstream ZenScript runtime parses
 * a bare `function`/`val`/`static`/... in key position as the start of a
 * declaration, not as a property name. The forward pass therefore quotes them
 * (`'function': ...`); revert's `UNQUOTE_KEY` rule must NOT strip those quotes.
 */
export const ZS_KEYWORDS = [
  'as',
  'break',
  'continue',
  'do',
  'else',
  'extends',
  'false',
  'for',
  'frigginClass',
  'frigginConstructor',
  'frigginGetter',
  'frigginSetter',
  'function',
  'global',
  'has',
  'if',
  'import',
  'in',
  'instanceof',
  'null',
  'return',
  'static',
  'to',
  'true',
  'val',
  'var',
  'version',
  'while',
  'zenClass',
  'zenConstructor',
  'zenGetter',
  'zenSetter',
] as const
