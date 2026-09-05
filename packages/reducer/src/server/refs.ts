import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'pathe'
import * as YAML from 'yaml'

/**
 * @file Config values that point at a file the pack already maintains.
 *
 * Everything the dedicated server needs to know about a pack is written down
 * somewhere in that pack already: the loader build in the relauncher config,
 * the JVM flags and the projects the released server pack refuses to install in
 * the ServerStarter config, the dev-only mods in an ignore file. Copying any of
 * that into `reducer.config.yml` would create a second list to keep in sync —
 * and a stale copy silently boots the wrong loader or loads a client-only mod.
 *
 * So every scalar and every list entry of the `server:` config is a *reference*:
 * `path/to/file` (whole file) or `path/to/file#dotted.path` (one value inside
 * it). Anything that does not name a readable file stays the literal it is, so
 * `-Xmx4G` and `OptiFine*` need no escaping.
 */

/** Value at `a.b.0.c` inside a parsed document, or `undefined` if the path misses. */
function walk(value: unknown, path: string): unknown {
  let cur = value
  for (const key of path.split('.').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = Array.isArray(cur)
      ? cur[Number(key)]
      : (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** Parse by extension: JSON, YAML, or a plain list of lines. */
function parseByExt(file: string, text: string): unknown {
  if (/\.json[5c]?$/i.test(file)) return JSON.parse(text) as unknown
  if (/\.ya?ml$/i.test(file)) return YAML.parse(text) as unknown
  return text.split(/\r?\n/)
}

async function readMaybe(packDir: string, file: string): Promise<string | undefined> {
  const path = isAbsolute(file) ? file : resolve(packDir, file)
  try {
    return await readFile(path, 'utf8')
  }
  catch {
    return undefined
  }
}

/**
 * Resolve one `file[#path]` reference. Returns the spec unchanged when it names
 * no readable file — a literal is just a reference that happens to point
 * nowhere, which is what makes the two forms interchangeable in every list.
 */
export async function readRef(packDir: string, spec: string): Promise<unknown> {
  const at = spec.lastIndexOf('#')
  const file = at < 0 ? spec : spec.slice(0, at)
  const path = at < 0 ? '' : spec.slice(at + 1)

  const text = await readMaybe(packDir, file)
  if (text === undefined) return spec

  const parsed = parseByExt(file, text)
  return path ? walk(parsed, path) : parsed
}

/** `readRef` for a single value: a string, or `undefined` when the ref misses. */
export async function readScalarRef(packDir: string, spec: string | undefined): Promise<string | undefined> {
  if (!spec) return undefined
  const value = await readRef(packDir, spec)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/**
 * Flatten one resolved reference into scalars: nested arrays are unwrapped and
 * empty/null entries dropped, so a YAML list with a trailing `~` or a
 * commented-out line survives the round trip.
 */
export function flattenRef(value: unknown): (string | number)[] {
  const out: (string | number)[] = []
  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) push(item)
      return
    }
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
    else if (typeof v === 'string' && v.trim()) out.push(v.trim())
  }
  push(value)
  return out
}

/** Resolve every spec of a list and flatten the results into one list. */
export async function expandRefList(packDir: string, specs: string[]): Promise<(string | number)[]> {
  const out: (string | number)[] = []
  for (const spec of specs) out.push(...flattenRef(await readRef(packDir, spec)))
  return out
}

/** {@link expandRefList} narrowed to strings — JVM args, linked dirs, ... */
export async function expandStringList(packDir: string, specs: string[]): Promise<string[]> {
  return (await expandRefList(packDir, specs)).map(String)
}
