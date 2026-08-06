/**
 * Git refuses to stage a path that lives in a submodule, and the VS Code Git
 * extension surfaces that refusal as a rejected promise. Submodule roots do
 * appear in `workingTreeChanges`, so they have to be filtered out before
 * anything reaches `repo.add`.
 */

/** Extracts `path = …` entries from a `.gitmodules` file body. */
export function parseSubmodulePaths(text: string): string[] {
  const paths: string[] = []
  for (const line of text.split('\n')) {
    // Everything after `=` is captured greedily and trimmed in code. Letting a
    // whitespace quantifier sit next to the capture would make the two able to
    // exchange characters, which is a backtracking hazard.
    const m = line.match(/^[\t ]*path[\t ]*=(.*)$/)
    if (!m) continue
    const normalized = m[1].trim().replace(/\\/g, '/').replace(/\/+$/, '')
    if (normalized) paths.push(normalized)
  }
  return paths
}

/** True when `rel` is a submodule root or lives inside one. */
export function isInsideSubmodule(rel: string, submodules: readonly string[]): boolean {
  const normalized = rel.replace(/\\/g, '/')
  return submodules.some(sub => normalized === sub || normalized.startsWith(`${sub}/`))
}
