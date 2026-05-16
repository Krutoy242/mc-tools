import type * as vscode from 'vscode'

export interface ParsedError {
  readonly severity   : 'error' | 'warning'
  readonly message    : string
  readonly targetUri? : vscode.Uri
  readonly targetLine?: number
  readonly originLine : number
}

export interface CraftTweakerParser {
  readonly name: string
  tryParse     : (lines: readonly string[], startIndex: number, workspaceRoot: string) => { result: ParsedError, linesConsumed: number } | undefined
}
