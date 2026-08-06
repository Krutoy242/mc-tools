/**
 * `crafttweaker.log` is a flat list of `[SCOPE][SCOPE][LEVEL] message` lines.
 * A line that does not open with a bracket — a Java exception and its `at …`
 * frames — continues the entry above it.
 */
export interface LogHeader {
  /** Bracketed groups other than the level, e.g. `['SERVER_STARTED', 'SERVER']`. */
  readonly scopes : readonly string[]
  /** Uppercased level, or `''` when no bracket held one. */
  readonly level  : string
  /** Everything after the last leading bracket, with a leading `:` dropped. */
  readonly message: string
}

export interface LogEntry {
  readonly header: LogHeader
  /** Continuation lines below the header, up to the next entry. */
  readonly body  : readonly string[]
}

const LEVELS = new Set(['FATAL', 'ERROR', 'WARNING', 'WARN', 'INFO', 'DEBUG', 'TRACE'])

/** Sticky so the leading run of brackets can be walked one group at a time. */
const BRACKET = /\s*\[([^\]]*)\]/y

/** Splits on either line ending — the log is CRLF on Windows and LF elsewhere. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function parseHeader(line: string): LogHeader | undefined {
  if (!line.startsWith('[')) return undefined

  const groups: string[] = []
  let end = 0
  for (;;) {
    BRACKET.lastIndex = end
    const m = BRACKET.exec(line)
    if (!m) break
    groups.push(m[1])
    end = BRACKET.lastIndex
  }
  if (!groups.length) return undefined

  const level = groups.find(g => LEVELS.has(g.toUpperCase()))?.toUpperCase() ?? ''
  return {
    scopes : groups.filter(g => g.toUpperCase() !== level),
    level,
    // `[ERROR] [FML]: something bad` — the separator belongs to the brackets,
    // not to the message.
    message: line.slice(end).replace(/^\s*:\s*/, '').trim(),
  }
}

/** Reads the entry that starts at `index`, assuming that line is a header. */
export function readEntry(lines: readonly string[], index: number): LogEntry | undefined {
  const header = parseHeader(lines[index])
  if (!header) return undefined

  const body: string[] = []
  for (let i = index + 1; i < lines.length && !lines[i].startsWith('['); i++) {
    body.push(lines[i])
  }
  // A trailing newline would otherwise hand the last entry an empty line, which
  // is exactly the invisible padding that shows up as a blank row in Problems.
  while (body.length && !body.at(-1)?.trim()) body.pop()

  return { header, body }
}
