import type { AddonDifference } from '../types.js'
import process from 'node:process'
import { fetchChangelogs, fetchIntermediateFileChangelogs } from '@mctools/curseforge'
import { markdownToHtml, sanitizeHtml } from '../utils/markdown.js'
import { formatDuration } from '../utils/misc.js'
import { extractGitHubCompare, fetchGitHubChangelog } from './github.js'
import { extractModrinthSlug, fetchModrinthChangelogs } from './modrinth.js'
import {
  cleanChangelogHtml,
  decodeLinkout,
  extractMarkdownChangelogLink,
  fetchMarkdownChangelog,
  isEmptyChangelog,
  isPlaceholderChangelog,
  stripGarbagePreamble,
  truncateOverlap,
  truncateToLength,
} from './utils.js'

const MAX_VERSION_LENGTH = 4000
const MAX_COMBINED_LENGTH = 6000

async function resolveExternalChangelog(md: string, oldDate: string, newDate: string): Promise<string | undefined> {
  const mrSlug = extractModrinthSlug(md)
  if (mrSlug) {
    const changelogs = await fetchModrinthChangelogs(mrSlug, oldDate, newDate)
    if (changelogs.length) return changelogs.join('<hr/>')
  }

  const ghCompare = extractGitHubCompare(md)
  if (ghCompare) {
    const changelog = await fetchGitHubChangelog(ghCompare.owner, ghCompare.repo, ghCompare.base, ghCompare.head)
    if (changelog) return changelog
  }

  const linkout = decodeLinkout(md)
  if (linkout) {
    const mrSlugFromLinkout = extractModrinthSlug(linkout)
    if (mrSlugFromLinkout) {
      const changelogs = await fetchModrinthChangelogs(mrSlugFromLinkout, oldDate, newDate)
      if (changelogs.length) return changelogs.join('<hr/>')
    }

    const ghCompareFromLinkout = extractGitHubCompare(linkout)
    if (ghCompareFromLinkout) {
      const changelog = await fetchGitHubChangelog(ghCompareFromLinkout.owner, ghCompareFromLinkout.repo, ghCompareFromLinkout.base, ghCompareFromLinkout.head)
      if (changelog) return changelog
    }
  }

  return undefined
}

interface ProcessedChangelog {
  versionName: string
  content    : string
  isLink     : boolean
  linkUrl?   : string
}

function looksLikeMarkdown(text: string): boolean {
  return /#{1,6}\s/.test(text) && !/<h[1-6]/i.test(text)
}

function normalizeChangelog(raw: string): string {
  let html = sanitizeHtml(raw)
  if (looksLikeMarkdown(html)) {
    html = markdownToHtml(html)
  }
  return html
}

function extractVersionFromFilename(filename: string): string | undefined {
  const matches = filename.match(/\d+(?:\.\d+)+/g)
  return matches ? matches[matches.length - 1] : undefined
}

export interface ModChangelogResult {
  /** Rendered changelog HTML (empty when nothing was found). */
  content: string
  /** Direction marker: `↑`×N for an upgrade, `↓`×N for a downgrade. N = files between versions. */
  arrows : string
}

export async function buildModChangelog(
  update: AddonDifference,
  key: string,
  gameVersion: string,
  verbose?: boolean,
  oldChangelogHtml?: string
): Promise<ModChangelogResult> {
  const modId = update.now.addonID
  const newFileId = update.now.installedFile.id

  // Detect downgrade by upload date: when the freshly installed file is older
  // than the previous one, versions were rolled back.
  const oldDate = new Date(update.was.installedFile.fileDate).getTime()
  const newDate = new Date(update.now.installedFile.fileDate).getTime()
  const isDowngrade = Number.isFinite(oldDate) && Number.isFinite(newDate) && newDate < oldDate

  // Intermediate files are always fetched from the lower to the higher version,
  // so for a downgrade the "low" baseline is the now-installed (`now`) file.
  const lowFile = isDowngrade ? update.now : update.was
  const highFile = isDowngrade ? update.was : update.now
  const baselineFileId = lowFile.installedFile.id

  // Thin arrows up to 10 files; beyond that a single heavy arrow + `xN`.
  const arrowChar = isDowngrade ? '↓' : '↑'
  const thickArrow = isDowngrade ? '⬇' : '⬆'
  const arrowsFor = (count: number): string => {
    const n = Math.max(1, count)
    return n > 10 ? `${thickArrow}x${n}` : arrowChar.repeat(n)
  }

  const t0 = performance.now()

  // Fetch all intermediate file changelogs
  const { changelogs: fileChangelogs, extraBefore, totalCount } = await fetchIntermediateFileChangelogs(
    modId,
    baselineFileId,
    highFile.installedFile.id,
    key,
    verbose,
    gameVersion,
    10,
    15,
    true
  )

  if (!fileChangelogs.length) {
    if (verbose) process.stdout.write(`[${modId}] No intermediate changelogs (${formatDuration(performance.now() - t0)})\n`)
    // Fallback: when old file is from a different project (e.g. fork/replacement),
    // fetch the new file changelog directly
    if (baselineFileId !== highFile.installedFile.id) {
      const newChangelogMap = await fetchChangelogs([{ modId, fileId: newFileId }], key)
      const newChangelog = newChangelogMap.get(newFileId)
      if (newChangelog) {
        let cleaned = stripGarbagePreamble(cleanChangelogHtml(normalizeChangelog(newChangelog)))
        if (!isEmptyChangelog(cleaned)) {
          cleaned = cleaned.replace(/\r?\n/g, ' ').trim()
          if (cleaned.length > MAX_COMBINED_LENGTH) {
            cleaned = truncateToLength(cleaned, MAX_COMBINED_LENGTH)
          }
          return { content: cleaned, arrows: arrowsFor(1) }
        }
      }
    }
    return { content: '', arrows: '' }
  }

  // Phase 1: Normalize all changelogs (sanitize + markdown conversion + cleanup)
  const normalizedChangelogs = fileChangelogs.map(fc => ({
    fileName: fc.fileName,
    content : normalizeChangelog(fc.changelog),
  }))

  interface ResolvedChangelog {
    fileName  : string
    content   : string
    linkout?  : string
    mdLinkUrl?: string
  }

  // Phase 2: Resolve external links for placeholders
  const tExternal = performance.now()
  const resolvedChangelogs: ResolvedChangelog[] = await Promise.all(
    normalizedChangelogs.map(async (item) => {
      if (isPlaceholderChangelog(item.content)) {
        const resolved = await resolveExternalChangelog(
          item.content,
          lowFile.installedFile.fileDate,
          highFile.installedFile.fileDate
        )
        if (resolved) {
          return { ...item, content: resolved }
        }
      }

      const mdLink = extractMarkdownChangelogLink(item.content)
      if (mdLink) {
        const versionHint = extractVersionFromFilename(item.fileName)
        const resolved = await fetchMarkdownChangelog(mdLink, versionHint)
        if (resolved) {
          return { ...item, content: resolved, mdLinkUrl: mdLink }
        }
        // Markdown link resolved but section is empty - track URL for fallback
        return { ...item, content: '', mdLinkUrl: mdLink }
      }

      // Only extract linkout from short/placeholder content, not from full changelogs
      const strippedText = item.content.replace(/<[^>]+>/g, '').trim()
      const linkout = strippedText.length < 200 ? decodeLinkout(item.content) : undefined
      if (linkout) {
        const linkoutMdLink = extractMarkdownChangelogLink(linkout)
        if (linkoutMdLink) {
          const versionHint = extractVersionFromFilename(item.fileName)
          const resolved = await fetchMarkdownChangelog(linkoutMdLink, versionHint)
          if (resolved) {
            return { ...item, content: resolved, mdLinkUrl: linkoutMdLink }
          }
          return { ...item, content: '', mdLinkUrl: linkoutMdLink }
        }
        return { ...item, content: '', linkout }
      }

      return item
    })
  )

  const externalCount = resolvedChangelogs.filter((item, i) => item.content !== normalizedChangelogs[i].content || item.linkout).length
  if (verbose && externalCount > 0) {
    process.stdout.write(`[${modId}] Resolved ${externalCount} external links (${formatDuration(performance.now() - tExternal)})\n`)
  }

  // Phase 3: Fetch old changelog for overlap detection
  const tOld = performance.now()
  let oldMd = ''
  // The pre-fetched `oldChangelogHtml` belongs to `was`; for a downgrade the
  // overlap baseline is the lower (`now`) file, so fetch it explicitly instead.
  if (oldChangelogHtml !== undefined && !isDowngrade) {
    oldMd = normalizeChangelog(oldChangelogHtml)
  }
  else {
    const oldChangelogMap = await fetchChangelogs([{ modId, fileId: baselineFileId }], key)
    oldMd = normalizeChangelog(oldChangelogMap.get(baselineFileId) ?? '')
  }

  if (oldMd && isPlaceholderChangelog(oldMd)) {
    const resolved = await resolveExternalChangelog(
      oldMd,
      lowFile.installedFile.fileDate,
      highFile.installedFile.fileDate
    )
    if (resolved) oldMd = cleanChangelogHtml(resolved)
  }
  if (verbose) process.stdout.write(`[${modId}] Old changelog fetched (${formatDuration(performance.now() - tOld)})\n`)

  // Phase 4: Build processed changelog list
  const allVersions: Array<{ versionName: string, content: string, linkout?: string, mdLinkUrl?: string }> = [
    { versionName: lowFile.installedFile.fileName.replace(/\.jar$/, ''), content: oldMd },
    ...resolvedChangelogs.map(item => ({
      versionName: item.fileName.replace(/\.jar$/, ''),
      content    : item.content,
      linkout    : item.linkout,
      mdLinkUrl  : item.mdLinkUrl,
    })),
    ...extraBefore
      ? [{
          versionName: extraBefore.fileName.replace(/\.jar$/, ''),
          content    : normalizeChangelog(extraBefore.changelog),
          linkout    : undefined as string | undefined,
        }]
      : [],
  ]

  // Phase 5: Truncate overlaps (compare each version against all newer versions)
  for (let i = allVersions.length - 2; i >= 0; i--) {
    const newerTexts = allVersions.slice(i + 1).map(v => v.content)
    allVersions[i].content = truncateOverlap(allVersions[i].content, newerTexts)
  }

  // Phase 6: Build final processed list (skip old baseline and extraBefore, skip empty, cleanup HTML)
  const processed: ProcessedChangelog[] = []
  const skipEnd = extraBefore ? 1 : 0
  for (let i = 1; i < allVersions.length - skipEnd; i++) {
    const item = allVersions[i]
    const linkout = item.linkout

    // Clean up HTML after truncation
    const cleaned = stripGarbagePreamble(cleanChangelogHtml(item.content))

    if (isEmptyChangelog(cleaned)) {
      const fallbackUrl = linkout || item.mdLinkUrl
      if (fallbackUrl) {
        processed.push({ versionName: item.versionName, content: '', isLink: true, linkUrl: fallbackUrl })
      }
      continue
    }

    // Apply per-version length limit
    let content = cleaned
    if (content.length > MAX_VERSION_LENGTH) {
      content = truncateToLength(content, MAX_VERSION_LENGTH)
    }

    processed.push({ versionName: item.versionName, content, isLink: false })
  }

  // Phase 7: Format output (arrow count = true files between versions, not the capped list)
  const arrows = arrowsFor(totalCount)
  if (!processed.length) return { content: '', arrows: '' }

  // For a downgrade, emit versions in reverse (oldest first) order.
  if (isDowngrade) processed.reverse()

  // Single version: just return content
  if (processed.length === 1 && !processed[0].isLink) {
    return { content: processed[0].content.replace(/\r?\n/g, ' ').trim(), arrows }
  }

  const parts: string[] = []
  for (const item of processed) {
    if (item.isLink && item.linkUrl) {
      parts.push(`<div><nobr><a href="${item.linkUrl}">${item.versionName} ↗</a></nobr></div>`)
    }
    else if (item.content) {
      parts.push(`<div><b>${item.versionName}</b><br>${item.content}</div>`)
    }
  }

  let result = parts.join('<hr/>')

  // Phase 8: Combined length limit
  if (result.length > MAX_COMBINED_LENGTH) {
    const segments = result.split('<hr/>')
    let accumulated = ''
    let keptCount = 0
    for (const segment of segments) {
      if (accumulated.length + segment.length + 5 > MAX_COMBINED_LENGTH && keptCount > 0) {
        const remaining = segments.length - keptCount
        accumulated += `<hr/>... and ${remaining} more version${remaining > 1 ? 's' : ''}`
        break
      }
      accumulated += (accumulated ? '<hr/>' : '') + segment
      keptCount++
    }
    result = accumulated
  }

  if (verbose) process.stdout.write(`[${modId}] Changelog built (${formatDuration(performance.now() - t0)})\n`)

  return { content: result.replace(/\r?\n/g, ' ').trim(), arrows }
}
