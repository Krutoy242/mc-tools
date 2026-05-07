/**
 * Public, side-effect-free API of `@mctools/format`.
 *
 * Pipeline:
 *
 *     ZenScript ──peggyParse──▶ TypeScript (with markers)
 *                                       │
 *                                       │ external: ESLint --fix
 *                                       ▼
 *                            TypeScript (post-fix)
 *                                       │
 *                                       │ tsToZs + stripDebris
 *                                       ▼
 *                                  ZenScript
 *
 * No function in this module touches the filesystem. See `formatFile.ts` for
 * the I/O wrapper used by the CLI.
 */

import type { LintAdapter, LintFixResult } from './lintAdapter.js'

import { peggyParse } from './peggy.js'
import { stripDebris, tsToZs } from './tsToZs.js'

export { createBatchAdapter } from './eslintRunner.js'

/** Result of a single conversion attempt. */
export type ConvertResult
  = | { ok: true,  ts: string }
    | { ok: false, error: Error }

/** Forward pass: ZS source → TS source decorated with markers. */
export function zsToTs(source: string): ConvertResult {
  try {
    return { ok: true, ts: peggyParse(source) }
  }
  catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }
}

/** Reverse pass: TS source (post-ESLint) → ZS source. */
export function revert(source: string): string {
  return stripDebris(tsToZs(source.replace(/\r/g, '')))
}

export interface FormatZsResult {
  output    : string
  errorCount: number
  messages? : LintFixResult['messages']
}

/**
 * End-to-end ZS-string → ZS-string formatting. Pure w.r.t. FS.
 * Throws `ZsParseError` if the forward parse fails.
 */
export async function formatZs(
  source         : string,
  adapter        : LintAdapter,
  virtualFilename = '__zs_virtual__.ts'
): Promise<FormatZsResult> {
  const fwd = zsToTs(source)
  if (!fwd.ok) throw fwd.error
  const lint = await adapter.fix(fwd.ts, virtualFilename)
  return { output: revert(lint.output), errorCount: lint.errorCount, messages: lint.messages }
}

/**
 * Synchronous variant — requires the adapter to return synchronously.
 * Throws if the adapter resolves asynchronously, since ESLint rules cannot
 * await. Used by `@mctools/eslint-plugin-zs` where `Linter.verifyAndFix` is
 * synchronous.
 */
export function formatZsSync(
  source         : string,
  adapter        : LintAdapter,
  virtualFilename = '__zs_virtual__.ts'
): FormatZsResult {
  const fwd = zsToTs(source)
  if (!fwd.ok) throw fwd.error
  const lint = adapter.fix(fwd.ts, virtualFilename)
  if (isPromiseLike(lint)) {
    throw new TypeError('formatZsSync: adapter.fix returned a Promise; use formatZs instead')
  }
  return { output: revert(lint.output), errorCount: lint.errorCount, messages: lint.messages }
}

function isPromiseLike<T>(v: T | PromiseLike<T>): v is PromiseLike<T> {
  return !!v && typeof (v as { then?: unknown }).then === 'function'
}

export type { LintAdapter, LintFixResult, LintMessage } from './lintAdapter.js'
export type { ZsParseError } from './peggy.js'

export { peggyParse } from './peggy.js'
// ----------------------------------------------------------------------------
// Re-exports kept for backwards compatibility (older consumers may still
// import these names directly).
// ----------------------------------------------------------------------------
export { tsToZs } from './tsToZs.js'
