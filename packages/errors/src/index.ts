import { naturalSort } from '@mctools/utils/natural-sort'
import { z } from 'zod'

// YAML's empty scalar parses to `null`, so accept it and normalize to undefined.
const optStr = z.string().nullish().transform(v => v ?? undefined)

export const ConfigSchema = z.object({
  boundaries: z.object({
    from: optStr,
    to  : optStr,
  }).optional(),
  groupBy: z.array(z.string()).optional(),
  ignore : z.union([z.string(), z.array(z.string())]),
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

export function compileConfig(config: Config): CompiledConfig {
  const ignoreList = Array.isArray(config.ignore) ? config.ignore : [config.ignore]
  const nonEmpty = ignoreList.filter(p => p.length > 0)

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
    return lo + 1
  }
}
