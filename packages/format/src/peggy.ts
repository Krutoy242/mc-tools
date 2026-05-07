/**
 * Thin wrapper around the precompiled Peggy parser.
 *
 * The grammar is compiled at package build time by
 * `scripts/build-parser.mjs` into `parser-generated.mjs` (an ES module). This
 * module is loaded synchronously here — no runtime FS access, no bundler
 * footguns.
 */

import { DEBRIS_PREAMBLE } from './markers.js'
// @ts-expect-error generated artifact, no .d.ts
import { parse as peggyParseRaw } from './parser-generated.mjs'

export interface ZsParseError extends Error {
  location?: {
    start: { line: number, column: number, offset: number }
    end  : { line: number, column: number, offset: number }
  }
}

/** Convert a ZenScript source into a marker-laden TypeScript source. */
export function peggyParse(source: string): string {
  return DEBRIS_PREAMBLE + (peggyParseRaw as (s: string) => string)(source)
}
