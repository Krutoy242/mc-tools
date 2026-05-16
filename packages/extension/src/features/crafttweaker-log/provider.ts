import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import type { ParsedError } from './parsers/base.js'
import * as path from 'pathe'
import * as vscode from 'vscode'

export class CraftTweakerDiagnosticsProvider {
  private ctLogUri: vscode.Uri

  constructor(
    private diagnostics: DiagnosticsManager,
    private logger: Logger,
    workspaceRoot: string,
    logPath: string
  ) {
    this.ctLogUri = vscode.Uri.file(path.join(workspaceRoot, logPath))
  }

  update(errors: readonly ParsedError[]): void {
    const byUri = new Map<string, vscode.Diagnostic[]>()
    let warnCount = 0
    let errorCount = 0

    for (const e of errors) {
      const uri = e.targetUri ?? this.ctLogUri
      const key = uri.toString()
      const list = byUri.get(key) ?? []
      const severity = e.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error
      if (e.severity === 'warning') warnCount++
      else errorCount++
      const line = Math.max(0, e.targetLine ?? e.originLine)
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
      const d = new vscode.Diagnostic(range, e.message, severity)
      d.source = 'mctools-crafttweaker'
      list.push(d)
      byUri.set(key, list)
    }

    for (const [key, list] of byUri) {
      const uri = vscode.Uri.parse(key)
      this.diagnostics.delete('mctools-crafttweaker', uri)
      this.diagnostics.set('mctools-crafttweaker', uri, list)
    }

    this.logger.info(`📊 Updated CraftTweaker diagnostics: ${errorCount} ERROR, ${warnCount} WARN across ${byUri.size} files`)
  }

  clear(): void {
    this.diagnostics.clear('mctools-crafttweaker')
  }
}
