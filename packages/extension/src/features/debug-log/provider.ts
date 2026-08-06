import type { FoundError, ParsedEntry } from '@mctools/errors'
import type { SortOrder } from '../../core/config.js'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import { parseEntry } from '@mctools/errors'
import * as vscode from 'vscode'
import { diagnosticSeverityFromString } from '../../util/helpers.js'

const SOURCE = 'mctools-debug-log'

/** `net.minecraft.client.audio.SoundManager` — a package path, not a mod name. */
const FQ_JAVA_CLASS = /^(?:[a-z_]\w*\.)+[A-Z_]\w*$/

/** Stands in for the severity icon when every finding reports the same severity. */
const LEVEL_MARKER: Record<string, string> = {
  FATAL: '⛔',
  ERROR: '⛔',
  WARN : '⚠️',
}

/**
 * The Problems panel offers no rich text (microsoft/vscode#54272), only three
 * differently-styled slots: the severity icon, a dimmed `source` and a `code`
 * that renders as a link once it has a target. So the log header is taken apart
 * and spread across them — level to the icon, thread to `source`, timestamp to
 * `code` — leaving the message itself to carry only the module and the text.
 */
function buildMessage(parsed: ParsedEntry, raw: string, sortOrder: SortOrder): string {
  // Chronological order costs the severity icon (see `SortOrder`), so the level
  // has to be readable from the message itself.
  const marker = sortOrder === 'chronological'
    ? `${LEVEL_MARKER[parsed.level ?? ''] ?? 'ℹ️'} `
    : ''
  if (!parsed.module) return marker + raw
  const shortModule = FQ_JAVA_CLASS.test(parsed.module)
    ? parsed.module.slice(parsed.module.lastIndexOf('.') + 1)
    : parsed.module
  const body = parsed.body ? `\n${parsed.body}` : ''
  return `${marker}⟦${shortModule}⟧ ${parsed.message}${body}`
}

function severityOf(parsed: ParsedEntry, raw: string, sortOrder: SortOrder): vscode.DiagnosticSeverity {
  // One severity for everything leaves the line number as the only sort key.
  if (sortOrder === 'chronological') return vscode.DiagnosticSeverity.Warning
  switch (parsed.level) {
    case undefined: return diagnosticSeverityFromString(raw)
    case 'FATAL':
    case 'ERROR': return vscode.DiagnosticSeverity.Error
    case 'WARN': return vscode.DiagnosticSeverity.Warning
    default: return vscode.DiagnosticSeverity.Information
  }
}

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
    private maxDiagnostics: number,
    private sortOrder: SortOrder = 'severity'
  ) {}

  append(errors: readonly FoundError[], uri: vscode.Uri): void {
    for (const e of errors) {
      const line = Math.max(0, e.line)
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
      const parsed = parseEntry(e.text)
      const d = new vscode.Diagnostic(
        range,
        buildMessage(parsed, e.text, this.sortOrder),
        severityOf(parsed, e.text, this.sortOrder)
      )
      d.source = parsed.thread ?? SOURCE
      if (e.time) d.code = { value: e.time, target: uri.with({ fragment: `L${line + 1}` }) }
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
