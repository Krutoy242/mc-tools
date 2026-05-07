/**
 * Abstract "lint+fix one TypeScript string" operation. Decouples the format
 * pipeline from how the lint actually happens — the CLI uses a batch ESLint
 * instance over real files; the eslint-plugin-zs uses the in-process Linter
 * with the host config already resolved. Both satisfy this shape.
 */
export interface LintAdapter {
  /**
   * Lint `tsSource` as if it lived at `virtualFilename` (used for config
   * resolution / file-pattern matching). Return the post-fix source.
   * `errorCount` is the count of remaining errors after fix; the caller decides
   * whether that is fatal.
   */
  fix: (tsSource: string, virtualFilename: string) => Promise<LintFixResult> | LintFixResult
}

export interface LintMessage {
  ruleId    : string | null
  severity  : 1 | 2
  message   : string
  line      : number
  column    : number
  endLine?  : number
  endColumn?: number
}

export interface LintFixResult {
  output    : string
  errorCount: number
  /** Raw lint messages (post-fix), if the adapter chose to expose them. */
  messages? : ReadonlyArray<LintMessage>
}
