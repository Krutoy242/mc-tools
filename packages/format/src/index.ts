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

import { peggyParse } from './peggy.js'
import { stripDebris, tsToZs } from './tsToZs.js'

export type { ZsParseError } from './peggy.js'

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

export { peggyParse } from './peggy.js'
// ----------------------------------------------------------------------------
// Re-exports kept for backwards compatibility (older consumers may still
// import these names directly).
// ----------------------------------------------------------------------------
export { tsToZs } from './tsToZs.js'
