import type { CraftTweakerParser, ParsedError } from './parsers/base.js'
import { readEntry, splitLines } from './entry.js'

export interface ScanResult {
  readonly errors   : readonly ParsedError[]
  readonly lineCount: number
  /** Findings per parser name, for the output channel. */
  readonly hits     : ReadonlyMap<string, number>
}

/**
 * Turns log text into findings — pure, so the whole pipeline is testable
 * without a log file or an extension host.
 *
 * Parsers are tried in order and the first that claims an entry wins; the
 * entry's continuation lines are skipped either way, so a stack trace can
 * never be mistaken for an entry of its own.
 */
export function scanLog(
  text: string,
  workspaceRoot: string,
  parsers: readonly CraftTweakerParser[]
): ScanResult {
  const lines = splitLines(text)
  const errors: ParsedError[] = []
  const hits = new Map<string, number>()

  let i = 0
  while (i < lines.length) {
    const entry = readEntry(lines, i)
    if (!entry) {
      i++
      continue
    }

    const ctx = { lines, index: i, header: entry.header, body: entry.body, workspaceRoot }
    let consumed = entry.body.length
    for (const parser of parsers) {
      const res = parser.tryParse(ctx)
      if (!res) continue
      errors.push(res.result)
      consumed = Math.max(consumed, res.linesConsumed)
      hits.set(parser.name, (hits.get(parser.name) ?? 0) + 1)
      break
    }
    i += consumed + 1
  }

  return { errors, lineCount: lines.length, hits }
}
