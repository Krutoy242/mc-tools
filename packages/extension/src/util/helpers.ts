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

export function isGitSubmoduleError(reason: unknown): boolean {
  if (reason instanceof Error) {
    const r = reason as Error & Record<string, unknown>
    if (String(r.gitErrorCode ?? '').includes('IsInSubmodule')) return true
    if (String(r.stderr ?? '').includes('is in submodule')) return true
    return r.message.includes('is in submodule') || r.message.includes('IsInSubmodule')
  }
  if (typeof reason === 'object' && reason !== null) {
    const r = reason as Record<string, unknown>
    if (String(r.gitErrorCode ?? '').includes('IsInSubmodule')) return true
    if (String(r.stderr ?? '').includes('is in submodule')) return true
    return JSON.stringify(reason).includes('is in submodule')
  }
  if (typeof reason === 'string') {
    return reason.includes('is in submodule') || reason.includes('IsInSubmodule')
  }
  return false
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
