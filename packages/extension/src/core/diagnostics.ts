import * as vscode from 'vscode'

export class DiagnosticsManager {
  private collections = new Map<string, vscode.DiagnosticCollection>()

  private collection(source: string): vscode.DiagnosticCollection {
    let col = this.collections.get(source)
    if (!col) {
      col = vscode.languages.createDiagnosticCollection(source)
      this.collections.set(source, col)
    }
    return col
  }

  set(source: string, uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
    this.collection(source).set(uri, diagnostics)
  }

  /**
   * Replaces the whole collection in one call. Unlike repeated {@link set},
   * this drops URIs that are absent from `entries`, so diagnostics for a file
   * that no longer has findings disappear instead of lingering.
   */
  setAll(source: string, entries: ReadonlyArray<[vscode.Uri, vscode.Diagnostic[]]>): void {
    this.collection(source).set(entries as [vscode.Uri, vscode.Diagnostic[]][])
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
