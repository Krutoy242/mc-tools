import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import type { ParsedError } from './parsers/base.js'
import * as path from 'pathe'
import * as vscode from 'vscode'

const SOURCE = 'mctools-crafttweaker'

interface Occurrence {
  readonly error: ParsedError
  count         : number
}

/**
 * Collapses findings that describe the same problem.
 *
 * A failing script is logged again for every event that trips it — one line per
 * mob spawn — which used to fill the panel with identical rows. The log line is
 * part of the identity only when the parser could not resolve a script target:
 * two occurrences of one message at the same `.zs` line are one problem, while
 * two unresolved entries are only known by where they were printed.
 */
function collapse(errors: readonly ParsedError[]): Occurrence[] {
  const byKey = new Map<string, Occurrence>()
  for (const error of errors) {
    const key = [
      error.severity,
      error.targetUri?.toString() ?? '',
      error.targetLine ?? error.originLine,
      error.message,
    ].join('\0')
    const hit = byKey.get(key)
    if (hit) hit.count++
    else byKey.set(key, { error, count: 1 })
  }
  return [...byKey.values()]
}

export class CraftTweakerDiagnosticsProvider {
  private ctLogUri: vscode.Uri
  private logName : string

  constructor(
    private diagnostics: DiagnosticsManager,
    private logger: Logger,
    workspaceRoot: string,
    logPath: string,
    private maxDiagnostics: number
  ) {
    this.ctLogUri = vscode.Uri.file(path.join(workspaceRoot, logPath))
    this.logName = path.basename(logPath)
  }

  update(errors: readonly ParsedError[]): void {
    const merged = collapse(errors)
    const errorCount = merged.filter(o => o.error.severity === 'error').length

    // Errors first, so a cap never hides a hard failure behind warnings.
    const ordered = merged.length > this.maxDiagnostics && this.maxDiagnostics > 0
      ? [...merged].sort((a, b) => Number(a.error.severity === 'warning') - Number(b.error.severity === 'warning'))
      : merged
    const kept = this.maxDiagnostics > 0 ? ordered.slice(0, this.maxDiagnostics) : ordered

    const byUri = new Map<string, { uri: vscode.Uri, list: vscode.Diagnostic[] }>()
    for (const { error, count } of kept) {
      const uri = error.targetUri ?? this.ctLogUri
      const key = uri.toString()
      const bucket = byUri.get(key) ?? { uri, list: [] }
      bucket.list.push(this.build(error, count))
      byUri.set(key, bucket)
    }

    // Replacing wholesale drops files that no longer have findings — a plain
    // per-URI `set` would leave diagnostics on scripts the user already fixed.
    this.diagnostics.setAll(SOURCE, [...byUri.values()].map(b => [b.uri, b.list]))

    const capped = merged.length - kept.length
    this.logger.info(
      `📊 Updated CraftTweaker diagnostics: ${errorCount} ERROR, ${merged.length - errorCount} WARN `
      + `across ${byUri.size} files (${errors.length} log entries)${
        capped > 0 ? `, ${capped} hidden by mc-tools.crafttweakerLog.maxDiagnostics` : ''}`
    )
  }

  private build(error: ParsedError, count: number): vscode.Diagnostic {
    const line = Math.max(0, error.targetLine ?? error.originLine)
    const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)

    // Trailing whitespace renders as a second, empty row in the Problems panel.
    const repeats = count > 1 ? ` (×${count})` : ''
    const d = new vscode.Diagnostic(
      range,
      error.message.trimEnd() + repeats,
      error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
    )

    // The dimmed slot is the entry's scopes when there are any; the panel's own
    // label is not worth the width otherwise.
    d.source = error.scope || SOURCE

    // Retargeting a finding onto a script hides where it was reported, so the
    // `code` slot links back to the log line — the panel renders it as a link.
    if (error.targetUri) {
      const at = error.originLine + 1
      d.code = { value: `${this.logName}:${at}`, target: this.ctLogUri.with({ fragment: `L${at}` }) }
    }

    if (error.related?.length) {
      d.relatedInformation = error.related.map(f => new vscode.DiagnosticRelatedInformation(
        new vscode.Location(f.uri, new vscode.Range(f.line, 0, f.line, Number.MAX_SAFE_INTEGER)),
        `called from ${f.label}`
      ))
    }

    return d
  }

  clear(): void {
    this.diagnostics.clear(SOURCE)
  }
}
