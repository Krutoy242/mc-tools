import type { FoundError } from '@mctools/errors'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import * as vscode from 'vscode'
import { diagnosticSeverityFromString } from '../../util/helpers.js'

export class DebugLogDiagnosticsProvider {
  constructor(
    private diagnostics: DiagnosticsManager,
    private logger: Logger
  ) {}

  update(errors: FoundError[], uri: vscode.Uri): void {
    const diagnostics = errors.map((e) => {
      const line = Math.max(0, e.line)
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
      const d = new vscode.Diagnostic(range, e.text, diagnosticSeverityFromString(e.text))
      d.source = 'mctools-debug-log'
      if (e.time) d.code = e.time
      return d
    })
    this.diagnostics.set('mctools-debug-log', uri, diagnostics)
  }

  clear(): void {
    this.diagnostics.clear('mctools-debug-log')
  }
}
