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

  // Debris fence
  debrisFence: 'CONVERSION_DEBRIS',
} as const

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
