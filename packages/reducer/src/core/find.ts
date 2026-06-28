import type { Mod } from '../Mod.js'
import { dependencyClosure, dependentsClosure } from './graph.js'
import { resolveMod } from './resolve.js'

export interface FindOptions {
  dependencies?: boolean
  dependents?  : boolean
}

/**
 * Resolve each query to its jar path, printing `query: ./mods/<file>` lines.
 * Optionally appends the dependency / dependent closure (excluding the mod
 * itself) so a caller can see what `enable`/`disable` would pull in.
 */
export function formatFind(mods: Mod[], queries: string[], opts: FindOptions = {}): string[] {
  const lines: string[] = []
  for (const q of queries) {
    const r = resolveMod(mods, q)
    if (r.kind === 'notfound') {
      lines.push(`${q}: <not found>`)
      continue
    }
    if (r.kind === 'ambiguous') {
      lines.push(`${q}: <ambiguous — ${r.candidates.map(c => c.fileName).join(', ')}>`)
      continue
    }

    const mod = r.mod
    lines.push(`${q}: ./mods/${mod.fileName}`)

    if (opts.dependencies) {
      const deps = [...dependencyClosure([mod])].filter(m => m !== mod)
      if (deps.length === 0) {
        lines.push('  dependencies: <none>')
      }
      else {
        for (const d of deps) lines.push(`  ⤷ dep:  ./mods/${d.fileName}`)
      }
    }
    if (opts.dependents) {
      const deps = [...dependentsClosure([mod])].filter(m => m !== mod)
      if (deps.length === 0) {
        lines.push('  dependents: <none>')
      }
      else {
        for (const d of deps) lines.push(`  ⤶ uses: ./mods/${d.fileName}`)
      }
    }
  }
  return lines
}
