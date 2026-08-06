import type * as vscode from 'vscode'
import type { LogHeader } from '../entry.js'

/** A `.zs` call site behind the reported one, rendered as related information. */
export interface ScriptFrame {
  readonly uri  : vscode.Uri
  readonly line : number
  readonly label: string
}

export interface ParsedError {
  readonly severity   : 'error' | 'warning'
  readonly message    : string
  readonly targetUri? : vscode.Uri
  readonly targetLine?: number
  readonly originLine : number
  /** The entry's bracketed scopes, for the diagnostic's dimmed `source` slot. */
  readonly scope?     : string
  /** Outer `.zs` frames of the stack, innermost first. */
  readonly related?   : readonly ScriptFrame[]
}

export interface ParseContext {
  /** Every line of the log: a parser may need to look past its own entry. */
  readonly lines        : readonly string[]
  /** Index of this entry's header line. */
  readonly index        : number
  readonly header       : LogHeader
  readonly body         : readonly string[]
  readonly workspaceRoot: string
}

export interface CraftTweakerParser {
  readonly name: string
  tryParse     : (ctx: ParseContext) => { result: ParsedError, linesConsumed: number } | undefined
}

/** `undefined` for levels that are not worth a diagnostic. */
export function severityOf(level: string): ParsedError['severity'] | undefined {
  switch (level) {
    case 'FATAL':
    case 'ERROR': return 'error'
    case 'WARNING':
    case 'WARN': return 'warning'
    default: return undefined
  }
}
