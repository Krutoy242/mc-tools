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

export async function buildModChangelog(
  update: AddonDifference,
  key: string,
  gameVersion: string,
  verbose?: boolean,
  oldChangelogHtml?: string
): Promise<string> {
  const modId = update.now.addonID
  const oldFileId = update.was.installedFile.id
  const newFileId = update.now.installedFile.id

  const t0 = performance.now()

  // Fetch all intermediate file changelogs
  const { changelogs: fileChangelogs, extraBefore } = await fetchIntermediateFileChangelogs(
    modId,
    oldFileId,
    newFileId,
    key,
    verbose,
    gameVersion,
    10,
    15,
    true
  )

  if (!fileChangelogs.length) {
    if (verbose) process.stdout.write(`[${modId}] No intermediate changelogs (${formatDuration(performance.now() - t0)})\n`)
    // Fallback: fetch changelog for the new file alone (e.g. when old file belongs to a different mod project)
    const newChangelogMap = await fetchChangelogs([{ modId, fileId: newFileId }], key)
    const newChangelog = newChangelogMap.get(newFileId)
    if (newChangelog) {
      const cleaned = stripGarbagePreamble(cleanChangelogHtml(normalizeChangelog(newChangelog)))
      if (!isEmptyChangelog(cleaned)) {
        return cleaned.replace(/\r?\n/g, ' ').trim()
      }
    }
    return ''
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
          update.was.installedFile.fileDate,
          update.now.installedFile.fileDate
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
  if (oldChangelogHtml !== undefined) {
    oldMd = normalizeChangelog(oldChangelogHtml)
  }
  else {
    const oldChangelogMap = await fetchChangelogs([{ modId, fileId: oldFileId }], key)
    oldMd = normalizeChangelog(oldChangelogMap.get(oldFileId) ?? '')
  }

  if (oldMd && isPlaceholderChangelog(oldMd)) {
    const resolved = await resolveExternalChangelog(
      oldMd,
      update.was.installedFile.fileDate,
      update.now.installedFile.fileDate
    )
    if (resolved) oldMd = cleanChangelogHtml(resolved)
  }
  if (verbose) process.stdout.write(`[${modId}] Old changelog fetched (${formatDuration(performance.now() - tOld)})\n`)

  // Phase 4: Build processed changelog list
  const allVersions: Array<{ versionName: string, content: string, linkout?: string, mdLinkUrl?: string }> = [
    { versionName: update.was.installedFile.fileName.replace(/\.jar$/, ''), content: oldMd },
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

  // Phase 7: Format output
  if (!processed.length) return ''

  // Single version: just return content
  if (processed.length === 1 && !processed[0].isLink) {
    return processed[0].content.replace(/\r?\n/g, ' ').trim()
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

  return result.replace(/\r?\n/g, ' ').trim()
}
