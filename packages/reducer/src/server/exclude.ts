import { flattenRef, readRef } from './refs.js'

/**
 * @file Which of the pack's jars never reach the dedicated server.
 *
 * A dedicated server dies on a client-only mod, and a pack already keeps that
 * list somewhere — the projects its released server pack skips, an ignore file
 * of dev-only mods. `server.exclude` names those files ({@link readRef}); this
 * module turns whatever they contain into a predicate over the jars.
 *
 * Nothing here knows a single mod by name: a CurseForge project id matches the
 * addon it belongs to, a wildcard matches file and mod names, and a plain word
 * matches either as a substring.
 */

export interface Excluded {
  /** CurseForge project ids — the form a server-pack ignore list uses. */
  ids     : Set<number>
  /** Name/filename matchers built from the string entries. */
  patterns: RegExp[]
}

/** A jar as the exclusion check sees it: its file name and, if known, its addon. */
export interface JarIdentity {
  fileName: string
  addonID?: number
  name?   : string
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/** `Optifine_*.jar` → anchored regex; a plain word → an unanchored one. */
function toPattern(spec: string): RegExp {
  if (!/[*?]/.test(spec)) return new RegExp(escapeRe(spec), 'i')
  const body = spec.split(/([*?])/).map(part =>
    part === '*' ? '.*' : part === '?' ? '.' : escapeRe(part)).join('')
  return new RegExp(`^${body}$`, 'i')
}

/**
 * Lines of a gitignore-style file, reduced to mod patterns.
 *
 * Such a file describes a whole pack export, not just its mods — comments,
 * negations and `config/...` entries all live there. Once *any* line addresses
 * `mods/`, only those lines can be about a jar, so the rest is dropped instead
 * of being matched against filenames it was never meant for.
 */
export function modPatternsOf(values: (string | number)[]): (string | number)[] {
  const lines = values.filter(v => typeof v !== 'string' || (!v.startsWith('#') && !v.startsWith('!')))
  const scoped = lines.filter((v): v is string => typeof v === 'string' && v.startsWith('mods/'))
  if (!scoped.length) return lines
  return scoped.map(v => v.slice('mods/'.length)).filter(Boolean)
}

/**
 * Build the exclusion predicate from `server.exclude`. Each spec is resolved
 * (and cleaned) on its own, so a literal in the same list is never filtered out
 * by the shape of a file listed next to it.
 */
export async function buildExclusion(packDir: string, specs: string[]): Promise<Excluded> {
  const ids = new Set<number>()
  const patterns: RegExp[] = []

  for (const spec of specs) {
    for (const value of modPatternsOf(flattenRef(await readRef(packDir, spec)))) {
      if (typeof value === 'number') ids.add(value)
      else patterns.push(toPattern(value))
    }
  }
  return { ids, patterns }
}

/** Does this jar stay out of the server? */
export function isExcluded(ex: Excluded, jar: JarIdentity): boolean {
  if (jar.addonID !== undefined && ex.ids.has(jar.addonID)) return true
  return ex.patterns.some(re => re.test(jar.fileName) || (!!jar.name && re.test(jar.name)))
}
