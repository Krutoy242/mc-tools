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
   * Replaces the whole collection in one call, so diagnostics for a file that
   * no longer has findings disappear instead of lingering.
   *
   * `DiagnosticCollection.set(entries)` only touches the URIs it lists — a file
   * missing from the array keeps whatever it had, and an empty array is a
   * no-op. URIs that dropped out are therefore cleared explicitly, in the same
   * call, by pairing them with `undefined`.
   */
  setAll(source: string, entries: ReadonlyArray<[vscode.Uri, vscode.Diagnostic[]]>): void {
    const col = this.collection(source)
    const next = new Set(entries.map(([uri]) => uri.toString()))
    const stale: Array<[vscode.Uri, vscode.Diagnostic[] | undefined]> = []
    col.forEach((uri) => {
      if (!next.has(uri.toString())) stale.push([uri, undefined])
    })
    if (!entries.length && !stale.length) return
    col.set([...entries, ...stale])
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
