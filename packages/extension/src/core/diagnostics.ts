import * as vscode from 'vscode'

export class DiagnosticsManager {
  private collections = new Map<string, vscode.DiagnosticCollection>()

  set(source: string, uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
    let col = this.collections.get(source)
    if (!col) {
      col = vscode.languages.createDiagnosticCollection(source)
      this.collections.set(source, col)
    }
    col.set(uri, diagnostics)
  }

  delete(source: string, uri: vscode.Uri): void {
    this.collections.get(source)?.delete(uri)
  }

  clear(source?: string): void {
    if (source) {
      this.collections.get(source)?.clear()
    }
    else {
      for (const col of this.collections.values()) {
        col.clear()
      }
    }
  }

  dispose(): void {
    for (const col of this.collections.values()) {
      col.dispose()
    }
    this.collections.clear()
  }
}
