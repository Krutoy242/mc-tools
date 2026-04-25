export interface ParsedEntry {
  thread?: string
  level? : string
  module?: string
  message: string
  body?  : string
}

export function parseEntry(text: string): ParsedEntry {
  const lf = text.indexOf('\n')
  const firstLine = (lf === -1 ? text : text.slice(0, lf)).trim()

  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const m = firstLine.match(/^(?:\[\d+:\d+:\d+\] )?\[([^/\]]+)\/(\w+)\] \[([^\]]+)\]:\s*(.*)$/)
  if (!m) return { message: text }

  const parsed: ParsedEntry = {
    thread : m[1],
    level  : m[2],
    module : m[3],
    message: m[4],
  }
  if (lf !== -1) {
    parsed.body = text.slice(lf + 1)
  }
  return parsed
}
