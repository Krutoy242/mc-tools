import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import type { ParsedError } from './parsers/base.js'
import * as path from 'pathe'
import * as vscode from 'vscode'

const SOURCE = 'mctools-crafttweaker'

export class CraftTweakerDiagnosticsProvider {
  private ctLogUri: vscode.Uri

  constructor(
    private diagnostics: DiagnosticsManager,
    private logger: Logger,
    workspaceRoot: string,
    logPath: string,
    private maxDiagnostics: number
  ) {
    this.ctLogUri = vscode.Uri.file(path.join(workspaceRoot, logPath))
  }

  update(errors: readonly ParsedError[]): void {
    const errorCount = errors.filter(e => e.severity === 'error').length
    const warnCount = errors.length - errorCount

    // Errors first, so a cap never hides a hard failure behind warnings.
    const ordered = errors.length > this.maxDiagnostics && this.maxDiagnostics > 0
      ? [...errors].sort((a, b) => Number(a.severity === 'warning') - Number(b.severity === 'warning'))
      : errors
    const kept = this.maxDiagnostics > 0 ? ordered.slice(0, this.maxDiagnostics) : ordered

    const byUri = new Map<string, { uri: vscode.Uri, list: vscode.Diagnostic[] }>()
    for (const e of kept) {
      const uri = e.targetUri ?? this.ctLogUri
      const key = uri.toString()
      const bucket = byUri.get(key) ?? { uri, list: [] }
      const line = Math.max(0, e.targetLine ?? e.originLine)
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
      const d = new vscode.Diagnostic(
        range,
        e.message,
        e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
      )
      d.source = SOURCE
      bucket.list.push(d)
      byUri.set(key, bucket)
    }

    // Replacing wholesale drops files that no longer have findings — a plain
    // per-URI `set` would leave diagnostics on scripts the user already fixed.
    this.diagnostics.setAll(SOURCE, [...byUri.values()].map(b => [b.uri, b.list]))

    const capped = errors.length - kept.length
    this.logger.info(
      `📊 Updated CraftTweaker diagnostics: ${errorCount} ERROR, ${warnCount} WARN across ${byUri.size} files${
        capped > 0 ? ` (${capped} hidden by mc-tools.crafttweakerLog.maxDiagnostics)` : ''}`
    )
  }

  clear(): void {
    this.diagnostics.clear(SOURCE)
  }
}
