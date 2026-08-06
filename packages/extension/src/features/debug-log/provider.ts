import type { FoundError } from '@mctools/errors'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import * as vscode from 'vscode'
import { diagnosticSeverityFromString } from '../../util/helpers.js'

const SOURCE = 'mctools-debug-log'

/**
 * The engine only ever reports errors it has not seen before, so diagnostics
 * are accumulated here. Handing VS Code just the novel ones would replace the
 * collection and make everything found earlier disappear.
 */
export class DebugLogDiagnosticsProvider {
  private accumulated: vscode.Diagnostic[] = []
  private dropped = 0

  constructor(
    private diagnostics: DiagnosticsManager,
    private logger: Logger,
    private maxDiagnostics: number
  ) {}

  append(errors: readonly FoundError[], uri: vscode.Uri): void {
    for (const e of errors) {
      const line = Math.max(0, e.line)
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
      const d = new vscode.Diagnostic(range, e.text, diagnosticSeverityFromString(e.text))
      d.source = SOURCE
      if (e.time) d.code = e.time
      this.accumulated.push(d)
    }

    if (this.maxDiagnostics > 0 && this.accumulated.length > this.maxDiagnostics) {
      const excess = this.accumulated.length - this.maxDiagnostics
      this.accumulated.splice(0, excess)
      this.dropped += excess
      this.logger.warn(
        `Diagnostic cap reached (${this.maxDiagnostics}) — dropped ${this.dropped} older entries. `
        + 'Raise mc-tools.debugLog.maxDiagnostics to keep more.'
      )
    }

    this.diagnostics.set(SOURCE, uri, this.accumulated)
    this.logger.info(`Debug-log diagnostics: +${errors.length}, ${this.accumulated.length} shown`)
  }

  clear(): void {
    this.accumulated = []
    this.dropped = 0
    this.diagnostics.clear(SOURCE)
  }
}
