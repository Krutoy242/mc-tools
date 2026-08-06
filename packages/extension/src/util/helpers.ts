import * as vscode from 'vscode'

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function diagnosticSeverityFromString(text: string): vscode.DiagnosticSeverity {
  const lower = text.toLowerCase()
  if (lower.includes('warn')) return vscode.DiagnosticSeverity.Warning
  if (lower.includes('info')) return vscode.DiagnosticSeverity.Information
  return vscode.DiagnosticSeverity.Error
}

export function globMatch(rel: string, pattern: string): boolean {
  if (pattern === rel) return true
  if (pattern.endsWith('/*') && rel.startsWith(pattern.slice(0, -1))) {
    const rest = rel.slice(pattern.length - 1)
    return !rest.includes('/')
  }
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
    return regex.test(rel)
  }
  return false
}
