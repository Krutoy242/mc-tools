import { markdownToHtml } from '../utils/markdown.js'
import {
  BOILERPLATE_KEYWORDS,
  BOILERPLATE_MAX_LENGTH,
  GARBAGE_HEADING_TITLES,
  MOD_NAME_GARBAGE_PATTERNS,
  PLACEHOLDER_PATTERNS,
  VERSION_HEADING_PATTERN,
} from './garbage-config.js'

interface VersionHeading {
  version: string
  index  : number
}

function extractVersionHeadings(html: string): VersionHeading[] {
  const headings: VersionHeading[] = []
  const regex = /<(?:h[1-6]|b)[^>]*>\D*(\d+(?:\.\d+)+)\D*<\/(?:h[1-6]|b)>/gi
  let match: RegExpExecArray | null = regex.exec(html)
  while (match !== null) {
    headings.push({ version: match[1], index: match.index })
    match = regex.exec(html)
  }
  return headings
}

function extractLiFingerprint(liHtml: string): string {
  const hrefMatch = liHtml.match(/href=["']([^"']+)["']/)
  if (hrefMatch) {
    const segments = hrefMatch[1].split('/')
    return `href:${segments.at(-1)!.slice(0, 40)}`
  }
  return liHtml.replace(/<[^>]+>/g, '').trim().slice(0, 80)
}

function extractLiItems(html: string) {
  const items: Array<{ index: number, fingerprint: string }> = []
  const regex = /<li[^>]*>.*?<\/li>/gi
  let match: RegExpExecArray | null = regex.exec(html)
  while (match !== null) {
    items.push({ index: match.index, fingerprint: extractLiFingerprint(match[0]) })
    match = regex.exec(html)
  }
  return items
}

function findFirstDuplicateLi(current: string, references: string[]): number {
  const currentItems = extractLiItems(current)
  if (!currentItems.length) return -1

  const referenceFingerprints = new Set<string>()
  for (const ref of references) {
    for (const item of extractLiItems(ref)) {
      referenceFingerprints.add(item.fingerprint)
    }
  }

  for (const item of currentItems) {
    if (referenceFingerprints.has(item.fingerprint)) {
      return item.index
    }
  }
  return -1
}

function trimBeforeBoundary(text: string, index: number): string {
  const before = text.slice(0, index)
  const lastHr = Math.max(
    before.lastIndexOf('<hr>'),
    before.lastIndexOf('<hr/>'),
    before.lastIndexOf('<hr />')
  )
  return lastHr >= 0 ? before.slice(0, lastHr).trim() : before.trim()
}

export function truncateOverlap(
  current: string,
  referenceTexts: string[]
): string {
  if (!current || !referenceTexts.length) return current

  // Strategy 1: Find version headings in current that exist in references
  const currentHeadings = extractVersionHeadings(current)
  if (currentHeadings.length) {
    const referenceVersions = new Set<string>()
    for (const ref of referenceTexts) {
      for (const h of extractVersionHeadings(ref)) {
        referenceVersions.add(h.version)
      }
    }
    let earliestHeading: VersionHeading | undefined
    for (const h of currentHeadings) {
      if (referenceVersions.has(h.version) && (!earliestHeading || h.index < earliestHeading.index)) {
        earliestHeading = h
      }
    }
    if (earliestHeading && earliestHeading.index > 0) {
      return trimBeforeBoundary(current, earliestHeading.index)
    }
  }

  // Strategy 2: Find duplicated list items
  const earliestDupe = findFirstDuplicateLi(current, referenceTexts)
  if (earliestDupe > 0) {
    return trimBeforeBoundary(current, earliestDupe)
  }

  return current
}

export function isPlaceholderChangelog(text: string): boolean {
  if (!text) return true
  const trimmed = text.trim()
  if (trimmed.length < 30) return true
  if (PLACEHOLDER_PATTERNS.fullChangelog.test(trimmed)) return true
  if (/full changelog/i.test(trimmed)) return true
  if (PLACEHOLDER_PATTERNS.readChangelog.test(trimmed)) return true
  if (PLACEHOLDER_PATTERNS.bareUrl.test(trimmed) && trimmed.split('\n').length === 1) return true
  if (PLACEHOLDER_PATTERNS.markdownLink.test(trimmed) && trimmed.split('\n').length === 1) return true
  if (PLACEHOLDER_PATTERNS.htmlChangelogLink.test(trimmed)) return true
  if (PLACEHOLDER_PATTERNS.modrinthChangelog.test(trimmed)) return true
  if (PLACEHOLDER_PATTERNS.githubCompare.test(trimmed)) return true
  return false
}

export function truncateToLength(html: string, maxLength: number): string {
  if (!html || html.length <= maxLength) return html

  const searchEnd = Math.min(maxLength, html.length)
  let bestIndex = -1
  for (const tag of ['</li>', '</p>', '</ul>']) {
    const idx = html.lastIndexOf(tag, searchEnd)
    if (idx > bestIndex) bestIndex = idx + tag.length
  }

  if (bestIndex > 0) {
    const truncated = html.slice(0, bestIndex).trim()
    const remaining = html.slice(bestIndex).match(/<li[^>]*>/gi)
    const remainingCount = remaining?.length ?? 0
    if (remainingCount > 0) {
      return `${truncated}<li><em>... and ${remainingCount} more change${remainingCount > 1 ? 's' : ''}</em></li>`
    }
    return truncated
  }

  return `${html.slice(0, maxLength)}...`
}

export function decodeLinkout(text: string): string | undefined {
  const mdMatch = text.match(/\/linkout\?remoteUrl=([^"\s)]+)/i)
  if (mdMatch) {
    try {
      return decodeURIComponent(decodeURIComponent(mdMatch[1]))
    }
    catch {
      /* empty */
    }
  }
  const htmlMatch = text.match(/href=["'][^"']*\/linkout\?remoteUrl=([^"\s]+)["']/i)
  if (htmlMatch) {
    try {
      return decodeURIComponent(decodeURIComponent(htmlMatch[1]))
    }
    catch {
      /* empty */
    }
  }
  return undefined
}

export function cleanChangelogHtml(html: string): string {
  if (!html) return ''

  // Strip leading <h1>Changelog</h1> (common in CurseForge HTML)
  let cleaned = html.replace(/^\s*<h1[^>]*>\s*Changelog\s*<\/h1>\s*/i, '')

  // Strip leading <h2>Changelog</h2>
  cleaned = cleaned.replace(/^\s*<h2[^>]*>\s*Changelog\s*<\/h2>\s*/i, '')

  // Strip leading version heading like <h2>v2.2.0</h2>, <h2>v2.7.1 (03/02/2026)</h2> or <h2>1.12.2-2.0.4</h2> followed by optional <hr>
  cleaned = cleaned.replace(new RegExp(`^\\s*<h[1-6][^>]*>\\s*${VERSION_HEADING_PATTERN}[^<]*<\\/h[1-6]>\\s*(?:<hr\\/?>\\s*)?`, 'i'), '')

  // Strip leading plain text version lines like "1.11.8:" or "v2.0.0" followed by <br>
  cleaned = cleaned.replace(/^\s*v?\d+(?:[.\-]\d+)+[:\s]*(?:<br\s*\/?>\s*)+/i, '')

  // Strip leading <p> tags containing only a version number (e.g. <p>2.5.0 :</p>)
  cleaned = cleaned.replace(/^\s*<p[^>]*>\s*(?:v(?:ersion)?\s*)?\d+(?:[.\-]\d+)+[\s:]*<\/p>\s*/i, '')

  // Normalize multiple consecutive <hr> tags
  cleaned = cleaned.replace(/(?:<hr\/?>\s*){2,}/gi, '<hr/>')

  // Strip leading/trailing whitespace
  cleaned = cleaned.trim()

  return cleaned
}

export function isEmptyChangelog(html: string): boolean {
  if (!html) return true
  const trimmed = html.trim()
  const stripped = trimmed.replace(/<[^>]+>/g, '').trim()
  // Consider empty if only whitespace, just "Changelog", just a version number, or empty list
  return stripped.length === 0
    || /^Changelog$/i.test(stripped)
    || /^v?\d+(?:[.\-]\d+)+$/i.test(stripped)
    || /^<ul>\s*<\/ul>$/i.test(trimmed)
}

export function extractMarkdownChangelogLink(html: string): string | undefined {
  const stripped = html.trim()
  const inner = stripped.replace(/^<p[^>]*>(.*?)<\/p>$/i, '$1').trim()

  // Bare URL to markdown or changelog
  if (/^https?:\/\/[^\s<>"']+(?:\.md|changelog|changes)[^\s<>"']*$/i.test(inner)) {
    return inner
  }

  // Markdown link
  const mdMatch = inner.match(/^\[[^\]]+\]\(([^)]*(?:\.md|changelog|changes)[^)]*)\)$/i)
  if (mdMatch) return mdMatch[1]

  // HTML link (entire content is just the link)
  const htmlMatch = inner.match(/^<a[^>]*href=["']([^"']*(?:\.md|changelog|changes)[^"']*)["'][^>]*>.*?<\/a>$/i)
  if (htmlMatch) return htmlMatch[1]

  // First block is a link paragraph to a changelog file
  const firstBlockMatch = stripped.match(/^<p[^>]*>\s*<a[^>]*href=["']([^"']*(?:\.md|changelog|changes)[^"']*)["'][^>]*>.*?<\/a>\s*<\/p>/i)
  if (firstBlockMatch) return firstBlockMatch[1]

  return undefined
}

export function stripGarbagePreamble(html: string): string {
  let result = html.trim()

  const modNamePatterns = MOD_NAME_GARBAGE_PATTERNS.join('|')
  const boilerplateKeywords = BOILERPLATE_KEYWORDS.join('|')

  while (true) {
    const before = result

    // Remove leading breaks, rules, and whitespace
    result = result.replace(/^(?:<br\s*\/?>\s*|<hr\s*\/?>\s*|\s)+/, '')

    // Empty paragraphs
    const emptyPara = result.match(/^<p[\s\S]*>\s*<\/p>\s*/i)
    if (emptyPara) {
      result = result.slice(emptyPara[0].length)
      continue
    }

    // Paragraphs containing only a version number (e.g. <p>2.5.0 :</p>)
    const versionPara = result.match(/^\s*<p[^>]*>\s*(?:v(?:ersion)?\s*)?\d+(?:[.\-]\d+)+[\s:]*<\/p>\s*/i)
    if (versionPara) {
      result = result.slice(versionPara[0].length)
      continue
    }

    // Headings with only garbage titles (including "Changes:", "Changes since X.Y", version numbers with optional dates)
    const headingMatch = result.match(/^<h[1-6][^>]*>(.*?)<\/h[1-6]>\s*/i)
    if (headingMatch) {
      const headingText = headingMatch[1].replace(/<[^>]+>/g, '').trim()
      const lowerText = headingText.toLowerCase()
      const isGarbageTitle = GARBAGE_HEADING_TITLES.some((t) => {
        const lt = t.toLowerCase()
        return lowerText === lt || lowerText.startsWith(`${lt}:`) || lowerText.startsWith(`${lt} since`)
      })
      const isChangesSince = /^Changes\s+since\s+[\w.]+/i.test(headingText)
      const isVersionHeading = /^(?:v(?:ersion)?\s*)?\d+(?:[.\-]\d+)+(?:\s+changelog)?/i.test(headingText)
      if (isGarbageTitle || isChangesSince || isVersionHeading) {
        result = result.slice(headingMatch[0].length)
        continue
      }
    }

    // Mod name + Changelog/Changes headings
    const modHeadingRegex = new RegExp(
      `^<h[1-6][^>]*>[^<]*\S\s+(?:${modNamePatterns})\s*<\/h[1-6]>\s*`,
      'i'
    )
    const modHeading = result.match(modHeadingRegex)
    if (modHeading) {
      result = result.slice(modHeading[0].length)
      continue
    }

    // Short boilerplate paragraphs
    const paraMatch = result.match(/^<p[^>]*>(.*?)<\/p>\s*/i)
    if (paraMatch) {
      const text = paraMatch[1].replace(/<[^>]+>/g, '').trim()
      if (text.length < BOILERPLATE_MAX_LENGTH && new RegExp(`\\b(?:${boilerplateKeywords})\\b`, 'i').test(text)) {
        result = result.slice(paraMatch[0].length)
        continue
      }
    }

    if (result === before) break
  }

  return result
}
const mdCache = new Map<string, string>()

function versionMatches(text: string, version: string): boolean {
  const escaped = version.replace(/\./g, '\\.')
  const regex = new RegExp(`(^|[^\\d.])${escaped}([^\\d.]|$)`)
  return regex.test(text)
}

function extractVersionSection(md: string, versionHint: string): string | undefined {
  const lines = md.split('\n')
  let startIdx = -1
  let headingLevel = 0

  for (let i = 0; i < lines.length; i++) {
    // Markdown heading: # Title
    const mdMatch = lines[i].match(/^(#{1,6}) (.*)$/)
    if (mdMatch && versionMatches(mdMatch[2], versionHint)) {
      startIdx = i
      headingLevel = mdMatch[1].length
      break
    }
    // Plain version line: 1.2.3: or 1.2.3 - or [1.2.3]
    const plainMatch = lines[i].match(/^(?:\[?v?\d+(?:\.\d+)+\]?\s*[:\-]\s*)+/)
    if (plainMatch && versionMatches(lines[i], versionHint)) {
      startIdx = i
      headingLevel = 99 // treat as lowest priority, only split on next version line
      break
    }
  }

  if (startIdx < 0) return undefined

  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (headingLevel === 99) {
      // For plain version lines, stop at next plain version line or markdown heading
      if (/^#{1,6}\s/.test(lines[i]) || /^(?:\[?v?\d+(?:\.\d+)+\]?\s*[:\-]\s*)+/.test(lines[i])) {
        endIdx = i
        break
      }
    }
    else {
      const match = lines[i].match(/^(#{1,6})\s/)
      if (match && match[1].length <= headingLevel) {
        endIdx = i
        break
      }
    }
  }

  return lines.slice(startIdx, endIdx).join('\n')
}

export async function fetchMarkdownChangelog(url: string, versionHint?: string): Promise<string | undefined> {
  const rawUrl = url
    .replace(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/i, 'raw.githubusercontent.com/$1/$2/$3/$4')
    .replace(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/blob\/([^/]+)\/(.+)/i, 'gitlab.com/$1/$2/-/raw/$3/$4')

  let md: string | undefined
  if (mdCache.has(rawUrl)) {
    md = mdCache.get(rawUrl)
  }
  else {
    try {
      const response = await fetch(rawUrl, { headers: { 'User-Agent': 'mctools-modlist/0.1.2' } })
      if (!response.ok) return undefined
      md = await response.text()
      mdCache.set(rawUrl, md)
    }
    catch {
      return undefined
    }
  }

  if (!md) return undefined

  if (versionHint) {
    const section = extractVersionSection(md, versionHint)
    if (section) return markdownToHtml(section)
    return undefined
  }

  return markdownToHtml(md)
}
