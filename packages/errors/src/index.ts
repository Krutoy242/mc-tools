import { naturalSort } from '@mctools/utils/natural-sort'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

// YAML's empty scalar parses to `null`, so accept it and normalize to undefined.
const optStr = z.string().nullish().transform(v => v ?? undefined)

/**
 * One node of the `ignore` tree.
 *
 * A plain string is a pattern to test against a log entry. A single-key map is
 * the same pattern plus the nested nodes it scopes — the key and each nested
 * pattern must all appear in the entry, in the order they are written. Since
 * every list item is its own map, the same key may repeat any number of times,
 * which is what lets `WARN:` / `ERROR:` / a module name be used purely as
 * grouping headings.
 */
export type IgnoreNode = string | { [pattern: string]: IgnoreChildren }
export type IgnoreChildren = string | null | IgnoreNode[]

const IgnoreNodeSchema: z.ZodType<IgnoreNode> = z.lazy(() => z.union([
  z.string(),
  z.record(z.string(), z.union([z.string(), z.null(), z.array(IgnoreNodeSchema)])),
]))

export const ConfigSchema = z.object({
  boundaries: z.object({
    from: optStr,
    to  : optStr,
  }).optional(),
  groupBy: z.array(z.string()).optional(),
  ignore : z.union([z.string(), z.array(IgnoreNodeSchema)]),
  match  : z.union([z.string(), z.array(z.string())]),
  replace: z.array(z.object({
    from: z.string(),
    to  : z.string(),
  })),
})

export type Config = z.infer<typeof ConfigSchema>

export interface CompiledConfig {
  boundaries?: { from?: RegExp, to?: RegExp }
  groupBy    : RegExp[]
  ignoreFast : RegExp | null
  match      : RegExp
  replace    : { from: RegExp, to: string }[]
}

export interface FoundError {
  text : string
  line : number
  time?: string
}

export function parseConfig(raw: unknown): Config {
  const res = ConfigSchema.safeParse(raw)
  if (res.success) return res.data
  const issues = res.error.issues
    .map(i => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid errors config:\n${issues}`)
}

export function compileConfigFromYaml(yamlString: string): CompiledConfig {
  return compileConfig(parseConfig(parseYaml(yamlString)))
}

/**
 * Text inserted between the levels of an `ignore` path. Stays on one line: a
 * level, a module and a message all live on the entry's first line, and letting
 * the gap span newlines would let a heading match one line and its child match
 * an unrelated line far below. A leaf that genuinely needs to span lines says
 * so itself with an explicit `/[\s\S]+/` regex.
 */
const GAP = '[^\\n]*?'

/**
 * Turn one node's own text into regex source.
 *
 * `/.../ `-delimited text is taken as a raw JS RegExp. Anything else is a
 * literal substring where `*` is the only wildcard — which is what almost every
 * rule needs and what keeps the config free of backslashes.
 */
export function compileIgnoreFragment(pattern: string): string {
  const asRegex = /^\/([\s\S]+)\/$/.exec(pattern)
  if (asRegex) return asRegex[1]
  return pattern
    .replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
    .replace(/\\\*/g, GAP)
}

/** Flatten the `ignore` tree into one regex source per leaf. */
export function compileIgnorePatterns(
  nodes: IgnoreNode[],
  prefix: string[] = [],
  out: string[] = []
): string[] {
  for (const node of nodes) {
    if (typeof node === 'string') {
      if (node.length) out.push(joinIgnorePath([...prefix, node]))
      continue
    }
    for (const [key, children] of Object.entries(node)) {
      const path = [...prefix, key]
      // `- FML:` with nothing under it — the heading is the whole pattern.
      if (children === null) out.push(joinIgnorePath(path))
      // `- OBJModel.Parser: found a face *` — YAML split one leaf on its `: `,
      // and concatenating the halves back matches the same text anyway.
      else if (typeof children === 'string') out.push(joinIgnorePath([...path, children]))
      else compileIgnorePatterns(children, path, out)
    }
  }
  return out
}

function joinIgnorePath(parts: string[]): string {
  return parts.map(compileIgnoreFragment).join(GAP)
}

export function compileConfig(config: Config): CompiledConfig {
  const ignoreList = Array.isArray(config.ignore) ? config.ignore : [config.ignore]
  const nonEmpty = compileIgnorePatterns(ignoreList)

  return {
    boundaries: config.boundaries && {
      from: config.boundaries.from ? new RegExp(config.boundaries.from, 'm') : undefined,
      to  : config.boundaries.to ? new RegExp(config.boundaries.to, 'm') : undefined,
    },
    groupBy   : (config.groupBy ?? []).map(s => new RegExp(s, 'm')),
    ignoreFast: nonEmpty.length
      ? new RegExp(nonEmpty.map(p => `(?:${p})`).join('|'), 'm')
      : null,
    match  : new RegExp(Array.isArray(config.match) ? config.match.join('') : config.match, 'gm'),
    replace: config.replace.map(r => ({ from: new RegExp(r.from, 'gm'), to: r.to })),
  }
}

function isCompiled(c: Config | CompiledConfig): c is CompiledConfig {
  return c.match instanceof RegExp
}

export function findErrors(debugLogText: string, config: Config | CompiledConfig): FoundError[] {
  const c = isCompiled(config) ? config : compileConfig(config)

  let from = 0
  let to = debugLogText.length
  if (c.boundaries?.from) {
    const m = c.boundaries.from.exec(debugLogText)
    if (m) from = m.index
  }
  if (c.boundaries?.to) {
    c.boundaries.to.lastIndex = 0
    const m = c.boundaries.to.exec(debugLogText.slice(from))
    if (m) to = from + m.index
  }
  if (to <= from) throw new Error('After applying boundaries, no log text left')

  const slice = debugLogText.slice(from, to)
  const lineForOffset = makeLineLookup(debugLogText)

  c.match.lastIndex = 0
  const result: FoundError[] = []
  for (const m of slice.matchAll(c.match)) {
    let entry = m[0]
    if (c.ignoreFast?.test(entry)) continue

    const timeMatch = entry.match(/^\[(\d+:\d+:\d+)\]/)
    const time = timeMatch ? timeMatch[1] : undefined

    const absOffset = m.index + from
    for (const r of c.replace) {
      r.from.lastIndex = 0
      entry = entry.replace(r.from, r.to)
    }
    result.push({ text: entry, line: lineForOffset(absOffset), time })
  }

  if (!c.groupBy.length) return result

  const groups = new Map<number | string, FoundError[]>()
  let unmatched = 0
  for (const e of result) {
    const idx = c.groupBy.findIndex(rgx => rgx.test(e.text))
    const key = idx === -1 ? `u${unmatched++}` : idx
    let bucket = groups.get(key)
    if (!bucket) groups.set(key, bucket = [])
    bucket.push(e)
  }

  const out: FoundError[] = []
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => naturalSort(a.text, b.text))
    for (const e of bucket) {
      if (e.text) out.push(e)
    }
  }
  return out
}

function makeLineLookup(text: string): (offset: number) => number {
  const newlines: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) newlines.push(i)
  }
  return (offset) => {
    let lo = 0
    let hi = newlines.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (newlines[mid] < offset) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}
