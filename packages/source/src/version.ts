import fs from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Tokens naming the game version rather than the mod's own. Deliberately
 * pinned to the 1.12 line this tool targets — a looser `1.x.y` pattern would
 * swallow mod versions like `1.10.203` or `1.9.5`.
 */
const GAME_TOKENS = /^(?:mc|minecraft|forge|fabric)?1\.12(?:\.\d+)?$/i

/** Build classifiers that trail the version in a jar file name. */
const CLASSIFIERS = /^(?:release|universal|deobf|dev|sources|api|all|client|server|forge|fabric|cleanroom|beta|alpha|snapshot|final|core|mc)$/i

/** A plain numeric version like `1.10.203` or `2.13.0.208`. */
const NUMERIC_VERSION = /^v?\d+(?:\.\d+)*$/i

/** A looser version like `r157` or `b12`, used only when nothing numeric fits. */
const LOOSE_VERSION = /^[a-z]?\d[\w.]*$/i

/** Strip a leading `v` so `v3.3.3` and `3.3.3` compare equal. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v(?=\d)/i, '')
}

/**
 * Guess the mod version encoded in a jar file name, e.g.
 * `MCT-ImmersiveTechnology-1.12.2-1.10.203-release.jar` → `1.10.203`.
 * Game version tokens and build classifiers are discarded.
 */
export function versionFromFileName(fileName: string): string | null {
  const stem = fileName
    .replace(/(?:\.(?:jar|disabled))+$/i, '')
    .replace(/^[!+@#~]+/, '')

  const all = stem.split(/[-_\s]+/).filter(Boolean).filter(t => !CLASSIFIERS.test(t))
  const modOnly = all.filter(t => !GAME_TOKENS.test(t))

  // Mod tokens win; the unfiltered pass only rescues jars named after nothing
  // but the game version, e.g. `Botania-1.12.2.jar`.
  for (const tokens of [modOnly, all]) {
    for (const re of [NUMERIC_VERSION, LOOSE_VERSION]) {
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (re.test(tokens[i])) return normalizeVersion(tokens[i])
      }
    }
  }
  return null
}

/** Read `key=value` from a `.properties`-shaped text, ignoring comments. */
function property(text: string, key: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)[ \\t]*${key}[ \\t]*[=:][ \\t]*(\\S+)`, 'i')
  return text.match(re)?.[1]
}

/** Keys naming the build number that is appended to the base version. */
const SUB_VERSION_KEYS = ['modsubversion', 'mod_sub_version', 'build_number', 'buildnumber']

/**
 * Pull a mod version out of a `version.properties` / `gradle.properties` /
 * `build.properties` body. Handles the split base + build-number layout (MCT
 * mods) by joining both halves back into a single dotted version.
 */
export function versionFromProperties(text: string): string | null {
  const base = ['mod_version', 'modversion', 'modVersion', 'version']
    .map(key => property(text, key))
    .find(v => v && !v.includes('$'))
  if (!base) return null

  const sub = SUB_VERSION_KEYS.map(key => property(text, key)).find(Boolean)
  const full = sub && !sub.includes('$') ? `${base}.${sub}` : base
  return NUMERIC_VERSION.test(full) || LOOSE_VERSION.test(full) ? normalizeVersion(full) : null
}

/** Pull `version = "1.6.0"` out of a `build.gradle` / `build.gradle.kts` body. */
export function versionFromGradle(text: string): string | null {
  const match = text.match(/(?:^|\n)[ \t]*(?:project\.)?version[ \t]*=[ \t]*["']([^"'$]+)["']/)
  const value = match?.[1]
  return value && (NUMERIC_VERSION.test(value) || LOOSE_VERSION.test(value)) ? normalizeVersion(value) : null
}

/** Files that may declare a mod's version, most specific first. */
export const VERSION_FILES = [
  'version.properties',
  'gradle.properties',
  'build.properties',
  'build.gradle',
  'build.gradle.kts',
] as const

/** Apply the parser matching `file`'s shape. */
export function versionFromFile(file: string, text: string): string | null {
  return file.endsWith('.properties') ? versionFromProperties(text) : versionFromGradle(text)
}

export interface SourceVersion {
  /** The parsed version string. */
  version: string
  /** Repo-relative file it was read from. */
  file   : string
}

/** Best-effort version of a checked-out source folder. */
export async function readSourceVersion(dir: string): Promise<SourceVersion | null> {
  for (const file of VERSION_FILES) {
    try {
      const version = versionFromFile(file, await fs.readFile(join(dir, file), 'utf8'))
      if (version) return { version, file }
    }
    catch { /* try next */ }
  }
  return null
}
