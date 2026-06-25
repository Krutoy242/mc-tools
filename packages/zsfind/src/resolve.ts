import type { Source } from './sources.ts'
import { distance } from 'fastest-levenshtein'
import { basename } from 'pathe'
import { parseDzs } from './dzs.ts'

const REGEX_META = /[()|*+?[^{$]/

export function isRegexQuery(query: string): boolean {
  return /^\/.+\/[a-z]*$/i.test(query) || REGEX_META.test(query)
}

export function resolveRegex(raw: string, sources: Source[]): Match[] {
  let pattern = raw
  let flags = 'i'
  const wrapped = raw.match(/^\/(.+)\/([a-z]*)$/)
  if (wrapped) {
    pattern = wrapped[1]
    if (wrapped[2]) flags = wrapped[2]
  }
  const regex = new RegExp(pattern, flags)
  const results: Match[] = []
  for (const source of sources) {
    for (const file of source.files) {
      const path = file.replace(/\.dzs$/, '')
      if (regex.test(path))
        results.push({ source, file })
    }
  }
  return results
}

export interface Match {
  source: Source
  file  : string
}

export interface Resolution {
  matches: Match[]
  member?: string
  locator: string
  lastSeg: string
}

interface ParsedQuery {
  locator     : string
  preferNative: boolean
}

function parseQuery(raw: string): ParsedQuery {
  let clean = raw.trim().replace(/\(\)$/, '')
  const preferNative = /^native[./\\]/i.test(clean)
  if (preferNative)
    clean = clean.replace(/^native[./\\]/i, '')

  const locator = clean
    .replace(/[\\.]/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')

  return { locator, preferNative }
}

function matchClass(source: Source, locator: string): string[] {
  const loc = locator.toLowerCase()
  const hasSlash = loc.includes('/')
  const target = `${loc}.dzs`

  const exact = source.files.filter(f => f.toLowerCase() === target)
  if (exact.length)
    return exact

  const tier2 = source.files.filter((f) => {
    const fl = f.toLowerCase()
    return hasSlash
      ? fl.endsWith(`/${target}`)
      : basename(fl, '.dzs') === loc
  })
  if (tier2.length)
    return tier2

  if (hasSlash) {
    const tier3 = source.files.filter(f => f.toLowerCase().includes(loc))
    if (tier3.length)
      return tier3
  }

  return []
}

async function preferDefinitions(source: Source, files: string[]): Promise<string[]> {
  const kept: string[] = []
  for (const f of files) {
    const { isExpansion } = await parseDzs(source, f)
    if (!isExpansion)
      kept.push(f)
  }
  return kept
}

async function searchSources(sources: Source[], locator: string): Promise<Match[]> {
  for (const source of sources) {
    const files = await preferDefinitions(source, matchClass(source, locator))
    if (files.length)
      return files.map(file => ({ source, file }))
  }
  return []
}

export async function resolveQuery(raw: string, sources: Source[]): Promise<Resolution> {
  const { locator, preferNative } = parseQuery(raw)

  const ordered = preferNative
    ? [...sources].sort(a => a.native ? -1 : 1)
    : [...sources].sort(a => a.native ? 1 : -1)

  let matches = await searchSources(ordered, locator)
  if (matches.length)
    return { matches, locator, lastSeg: basename(locator) }

  const segs = locator.split('/')
  if (segs.length > 1) {
    const member = segs.pop()!
    const classLoc = segs.join('/')
    matches = await searchSources(ordered, classLoc)
    if (matches.length)
      return { matches, member, locator: classLoc, lastSeg: member }
  }

  return { matches: [], locator, lastSeg: basename(locator) }
}

export interface Suggestion {
  base  : string
  source: Source
  file  : string
  dist  : number
}

export function suggest(lastSeg: string, sources: Source[], limit = 8): Suggestion[] {
  const target = lastSeg.toLowerCase()
  const best = new Map<string, Suggestion>()

  for (const source of sources) {
    for (const file of source.files) {
      const base = basename(file, '.dzs')
      const bl = base.toLowerCase()
      if (Math.abs(bl.length - target.length) > 3)
        continue

      let dist = distance(target, bl)
      if (bl.includes(target) || target.includes(bl))
        dist = Math.min(dist, 1)
      if (dist > 3)
        continue

      const prev = best.get(base)
      if (!prev || dist < prev.dist)
        best.set(base, { base, source, file, dist })
    }
  }

  return [...best.values()]
    .sort((a, b) => a.dist - b.dist || a.base.localeCompare(b.base))
    .slice(0, limit)
}
