import type { CraftTweakerParser, ParsedError } from './base.js'
import * as path from 'pathe'
import * as vscode from 'vscode'

const STACK_TRACE_PATTERN = /^(?:java\.|sun\.|com\.sun\.).*?(?:Exception|Error)(?::.*)?$/
const SCRIPT_LINE_PATTERN = /__script__\((.*?\.zs):(\d+)\)/
// eslint-disable-next-line regexp/no-super-linear-backtracking
const INLINE_PATTERN = /(?:.*\s)?(.*?scripts[/\\].*?\.zs):(\d+)\s*>\s*(.*)/

export const scriptParser: CraftTweakerParser = {
  name: 'script',
  tryParse(lines, startIndex, workspaceRoot) {
    const line = lines[startIndex]
    if (!/\[(?:FATAL|ERROR)\]/.test(line)) return undefined

    const scriptsDir = path.join(workspaceRoot, 'scripts')
    const severity: ParsedError['severity'] = 'error'
    let finalFilePath: string | undefined
    let finalLineNum: number | undefined
    let finalMessage = line.trim()
    let linesConsumed = 0

    let potentialMessage: string | undefined
    for (let j = 1; j <= 5; j++) {
      if (startIndex + j >= lines.length) break
      const nextLine = lines[startIndex + j].trim()
      if (STACK_TRACE_PATTERN.test(nextLine)) {
        potentialMessage = nextLine
      }
      const scriptMatch = nextLine.match(SCRIPT_LINE_PATTERN)
      if (scriptMatch) {
        finalFilePath = path.join(scriptsDir, scriptMatch[1])
        finalLineNum = Number.parseInt(scriptMatch[2], 10) - 1
        if (potentialMessage) finalMessage = potentialMessage
        linesConsumed = j
        break
      }
    }

    if (!finalFilePath) {
      const inlineMatch = line.match(INLINE_PATTERN)
      if (inlineMatch) {
        const p = inlineMatch[1]
        finalFilePath = path.isAbsolute(p) ? p : path.join(workspaceRoot, p)
        finalLineNum = Number.parseInt(inlineMatch[2], 10) - 1
        finalMessage = inlineMatch[3].trim()
      }
    }

    if (!finalFilePath || finalLineNum === undefined) return undefined

    return {
      result: {
        severity,
        message   : finalMessage,
        targetUri : vscode.Uri.file(finalFilePath),
        targetLine: finalLineNum,
        originLine: startIndex,
      },
      linesConsumed,
    }
  },
}
