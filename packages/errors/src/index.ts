import type { Node } from 'yaml'
import { naturalSort } from '@mctools/utils/natural-sort'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
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

/**
 * One leaf of the `ignore` tree, kept as an addressable object so a dropped
 * entry can be attributed back to the exact rule — and config line — that
 * dropped it. Rules nobody ever hits are dead weight in a config that has
 * grown for years, and `--unused` lists them.
 */
export interface IgnoreRule {
  /** Heading keys plus the leaf, exactly as written in the YAML. */
  path  : string[]
  /** Regex source this leaf compiles to — one branch of `ignoreFast`. */
  source: string
  /** `source` compiled on its own, for attributing a hit to this rule. */
  regex : RegExp
  /** 1-based line of the leaf in the config file. Only set by `compileConfigFromYaml`. */
  line? : number
}

/** Per-rule hit counters, filled in by `findErrors` when one is passed in. */
export type IgnoreHits = Map<IgnoreRule, number>

export interface CompiledConfig {
  boundaries?: { from?: RegExp, to?: RegExp }
  groupBy    : RegExp[]
  ignoreFast : RegExp | null
  ignoreRules: IgnoreRule[]
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

/**
 * Compile from YAML *text* rather than from an already-parsed object, which is
 * the only way to learn where each rule is written: the plain JS tree has no
 * positions, so the document AST is walked in parallel to stamp every rule with
 * its line.
 */
export function compileConfigFromYaml(yamlString: string): CompiledConfig {
  const doc = parseDocument(yamlString)
  const compiled = compileConfig(parseConfig(doc.toJS() as unknown))
  attachIgnoreLines(compiled.ignoreRules, doc.get('ignore', true), yamlString)
  return compiled
}

interface IgnoreLocation { path: string[], line: number }

/**
 * Stamp each compiled rule with the line its leaf is written on.
 *
 * Both walks are pre-order over the same tree, but they are matched by path
 * instead of by index so that anything the JS tree and the AST disagree about
 * (a map with duplicate keys collapses in JS but not in the AST) costs at most
 * a missing line number, never a wrong one.
 */
function attachIgnoreLines(rules: IgnoreRule[], ignoreNode: unknown, yamlString: string): void {
  const lineOf = makeLineLookup(yamlString)
  const locations = collectIgnoreLocations(ignoreNode, [], offset => lineOf(offset) + 1, [])

  const byPath = new Map<string, number[]>()
  for (const loc of locations) {
    const key = loc.path.join('\0')
    const queue = byPath.get(key)
    if (queue) queue.push(loc.line)
    else byPath.set(key, [loc.line])
  }

  for (const rule of rules) {
    const line = byPath.get(rule.path.join('\0'))?.shift()
    if (line !== undefined) rule.line = line
  }
}

/** Walk the `ignore` document AST, mirroring `compileIgnoreRules`, for positions. */
function collectIgnoreLocations(
  node: unknown,
  prefix: string[],
  lineOf: (offset: number) => number,
  out: IgnoreLocation[]
): IgnoreLocation[] {
  if (isScalar(node)) {
    if (typeof node.value === 'string' && node.value.length)
      out.push({ path: [...prefix, node.value], line: lineAt(node, lineOf) })
  }
  else if (isSeq(node)) {
    for (const item of node.items) collectIgnoreLocations(item, prefix, lineOf, out)
  }
  else if (isMap(node)) {
    for (const pair of node.items) {
      /* v8 ignore next -- a non-scalar (`? [a, b]`) key is not expressible in this schema */
      if (!isScalar(pair.key)) continue
      const path = [...prefix, String(pair.key.value)]
      // The leaf is deleted by the line its key sits on, so a `key: value` leaf
      // and a bare `key:` heading both report the key's line.
      const line = lineAt(pair.key, lineOf)
      const value = pair.value
      if (isScalar(value)) {
        if (value.value === null) out.push({ path, line })
        else out.push({ path: [...path, String(value.value)], line })
      }
      else {
        collectIgnoreLocations(value, path, lineOf, out)
      }
    }
  }
  return out
}

function lineAt(node: Node, lineOf: (offset: number) => number): number {
  /* v8 ignore next -- every node of a freshly parsed document carries a range */
  return lineOf(node.range?.[0] ?? 0)
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

/** Flatten the `ignore` tree into one rule per leaf, in written order. */
export function compileIgnoreRules(
  nodes: IgnoreNode[],
  prefix: string[] = [],
  out: IgnoreRule[] = []
): IgnoreRule[] {
  for (const node of nodes) {
    if (typeof node === 'string') {
      if (node.length) out.push(makeIgnoreRule([...prefix, node]))
      continue
    }
    for (const [key, children] of Object.entries(node)) {
      const path = [...prefix, key]
      // `- FML:` with nothing under it — the heading is the whole pattern.
      if (children === null) out.push(makeIgnoreRule(path))
      // `- OBJModel.Parser: found a face *` — YAML split one leaf on its `: `,
      // and concatenating the halves back matches the same text anyway.
      else if (typeof children === 'string') out.push(makeIgnoreRule([...path, children]))
      else compileIgnoreRules(children, path, out)
    }
  }
  return out
}

/** Flatten the `ignore` tree into one regex source per leaf. */
export function compileIgnorePatterns(
  nodes: IgnoreNode[],
  prefix: string[] = [],
  out: string[] = []
): string[] {
  for (const rule of compileIgnoreRules(nodes, prefix)) out.push(rule.source)
  return out
}

function makeIgnoreRule(path: string[]): IgnoreRule {
  const source = path.map(compileIgnoreFragment).join(GAP)
  return { path, source, regex: new RegExp(source, 'm') }
}

export function compileConfig(config: Config): CompiledConfig {
  const ignoreList = Array.isArray(config.ignore) ? config.ignore : [config.ignore]
  const ignoreRules = compileIgnoreRules(ignoreList)

  return {
    boundaries: config.boundaries && {
      from: config.boundaries.from ? new RegExp(config.boundaries.from, 'm') : undefined,
      to  : config.boundaries.to ? new RegExp(config.boundaries.to, 'm') : undefined,
    },
    groupBy   : (config.groupBy ?? []).map(s => new RegExp(s, 'm')),
    ignoreFast: ignoreRules.length
      ? new RegExp(ignoreRules.map(r => `(?:${r.source})`).join('|'), 'm')
      : null,
    ignoreRules,
    match  : new RegExp(Array.isArray(config.match) ? config.match.join('') : config.match, 'gm'),
    replace: config.replace.map(r => ({ from: new RegExp(r.from, 'gm'), to: r.to })),
  }
}

function isCompiled(c: Config | CompiledConfig): c is CompiledConfig {
  return c.match instanceof RegExp
}

/**
 * Collect the log entries the `ignore` tree does not cover.
 *
 * Passing an `ignoreHits` map opts into attribution: every dropped entry is
 * credited to the first rule that matches it, so a caller can tell which rules
 * are alive. Left out, nothing is attributed and the scan costs what it always
 * did.
 */
export function findErrors(
  debugLogText: string,
  config: Config | CompiledConfig,
  ignoreHits?: IgnoreHits
): FoundError[] {
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
    // Fast path first: one merged alternation decides, and only the entries it
    // drops pay for finding out *which* rule dropped them.
    if (c.ignoreFast?.test(entry)) {
      if (ignoreHits) countIgnoreHit(c.ignoreRules, entry, ignoreHits)
      continue
    }

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

/** Credit a dropped entry to the first rule that matches it. */
function countIgnoreHit(rules: IgnoreRule[], entry: string, hits: IgnoreHits): void {
  const rule = rules.find(r => r.regex.test(entry))
  if (rule) hits.set(rule, (hits.get(rule) ?? 0) + 1)
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
