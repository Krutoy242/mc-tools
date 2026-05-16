import type { CraftTweakerParser, ParsedError } from './base.js'

export const genericParser: CraftTweakerParser = {
  name: 'generic',
  tryParse(lines, startIndex, _workspaceRoot) {
    const line = lines[startIndex]
    const match = line.match(/\[(FATAL|ERROR|WARNING)\]/)
    if (!match) return undefined

    const logLevel = match[1]
    const severity: ParsedError['severity'] = logLevel === 'WARNING' ? 'warning' : 'error'

    // eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/no-unused-capturing-group
    let cleanMessage = line.replace(/^(\s*\[[^\]]+\]\s*)+/, '')

    const lastColon = cleanMessage.lastIndexOf(':')
    if (lastColon !== -1) {
      cleanMessage = cleanMessage.substring(lastColon + 1).trim()
    }

    if (!cleanMessage) cleanMessage = line.trim()

    return {
      result: {
        severity,
        message   : cleanMessage,
        originLine: startIndex,
      },
      linesConsumed: 0,
    }
  },
}
