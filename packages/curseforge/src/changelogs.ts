import type CFV2 from 'curseforge-v2'
import type { ChangelogEntry, FileChangelog } from './types.js'
import process from 'node:process'
import { getClient } from './client.js'
import { asFileID } from './minecraftinstance.js'

/**
 * Execute async tasks with a concurrency limit.
 * @param items Array of items to process
 * @param fn Async function to apply to each item
 * @param concurrency Maximum number of concurrent tasks
 * @returns Array of results in the same order as input
 */
async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  if (!items.length) return []
  if (concurrency <= 0) concurrency = 1

  const results = Array.from<R>({ length: items.length })
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++
      results[currentIndex] = await fn(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, async () => worker()))
  return results
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms.toFixed(0)}ms`
}

/**
 * Fetch changelogs for specific mod files from CurseForge.
 * Requests are executed in parallel with a concurrency limit.
 * @param entries Array of { modId, fileId } objects
 * @param cfApiKey CurseForge API key
 * @param doLogging Log progress into stdout
 * @param concurrency Maximum number of concurrent requests (default: 10)
 * @returns Map of fileId → changelog HTML string
 */
export async function fetchChangelogs(
  entries: ChangelogEntry[],
  cfApiKey: string,
  doLogging = false,
  concurrency = 15
): Promise<Map<number, string>> {
  if (!entries.length) return new Map()

  const client = getClient(cfApiKey)
  const result = new Map<number, string>()
  const start = performance.now()

  await runConcurrent(
    entries,
    async ({ modId, fileId }, i) => {
      if (doLogging) process.stdout.write(`\rFetching changelogs: ${i + 1}/${entries.length}`)

      try {
        const response = await client.getModFileChangelog(modId, fileId)
        if (response.data?.data) result.set(fileId, response.data.data)
      }
      catch {
        // Silently skip failed changelogs
      }
    },
    concurrency
  )

  if (doLogging) process.stdout.write(` (${fmtMs(performance.now() - start)})\n`)
  return result
}

/**
 * Fetch a single file changelog from CurseForge.
 * @param entry Object with modId and fileId
 * @param cfApiKey CurseForge API key
 * @returns Changelog HTML string, or empty string if not found
 */
export async function fetchChangelog(
  entry: ChangelogEntry,
  cfApiKey: string
): Promise<string> {
  const map = await fetchChangelogs([entry], cfApiKey)
  return map.get(entry.fileId) ?? ''
}

/**
 * Fetch all file changelogs between two file versions of a mod.
 * Files are ordered by upload date and filtered to include only those
 * strictly after oldFileId and up to newFileId.
 * Changelog requests are executed in parallel with a concurrency limit.
 */
export async function fetchIntermediateFileChangelogs(
  modId: number,
  oldFileId: number,
  newFileId: number,
  cfApiKey: string,
  doLogging = false,
  gameVersion?: string,
  maxFiles = 15,
  concurrency = 15,
  includeExtraBefore?: boolean
): Promise<{ changelogs: FileChangelog[], extraBefore?: FileChangelog, totalCount: number }> {
  const client = getClient(cfApiKey)
  const startFiles = performance.now()

  // Fetch files for this mod (parallel paginate up to 3 pages)
  const pageSize = 50
  const maxPages = 3
  const allFiles: CFV2.CF2File[] = []

  // Load page 0 first to get total count and first batch of files
  const page0 = await client.getModFiles({ modId, ...gameVersion ? { gameVersion } : {}, index: 0, pageSize })
  const files0 = page0.data?.data ?? []
  if (!files0.length) return { changelogs: [], totalCount: 0 }
  allFiles.push(...files0)

  const totalCount = (page0.data as unknown as { pagination?: { totalCount?: number } })?.pagination?.totalCount ?? files0.length
  const pagesNeeded = Math.min(maxPages, Math.ceil(totalCount / pageSize))

  if (pagesNeeded > 1) {
    const pagePromises = Array.from({ length: pagesNeeded - 1 }, async (_, i) =>
      client.getModFiles({ modId, ...gameVersion ? { gameVersion } : {}, index: (i + 1) * pageSize, pageSize }))
    const pages = await Promise.all(pagePromises)
    for (const page of pages) {
      const files = page.data?.data ?? []
      if (!files.length) break
      allFiles.push(...files)
    }
  }

  if (!allFiles.length) return { changelogs: [], totalCount: 0 }

  // Sort by date descending (newest first; files without valid dates go to the end)
  allFiles.sort((a, b) => {
    const da = new Date(a.fileDate).getTime()
    const db = new Date(b.fileDate).getTime()
    if (Number.isNaN(da)) return 1
    if (Number.isNaN(db)) return -1
    return db - da
  })

  const oldFile = allFiles.find(f => f.id === oldFileId)
  const newFile = allFiles.find(f => f.id === newFileId)
  if (!oldFile || !newFile) return { changelogs: [], totalCount: 0 }

  const oldDate = new Date(oldFile.fileDate).getTime()
  const newDate = new Date(newFile.fileDate).getTime()

  // Files strictly after old and up to new
  let intermediateFiles = allFiles.filter((f) => {
    const t = new Date(f.fileDate).getTime()
    return t > oldDate && t <= newDate
  })

  if (!intermediateFiles.length) return { changelogs: [], totalCount: 0 }

  // True number of files between the two versions, before the display cap.
  const intermediateTotal = intermediateFiles.length

  // Cap to maxFiles most recent to avoid drowning in daily updates
  if (intermediateFiles.length > maxFiles) {
    intermediateFiles = intermediateFiles.slice(0, maxFiles)
  }

  if (doLogging) process.stdout.write(`[${modId}] Listed ${allFiles.length} files (${fmtMs(performance.now() - startFiles)}) → ${intermediateFiles.length} intermediate. `)

  const startChangelogs = performance.now()
  const result = await runConcurrent(
    intermediateFiles,
    async (file, i) => {
      if (doLogging) process.stdout.write(`\rFetching intermediate changelogs [${modId}]: ${i + 1}/${intermediateFiles.length}`)

      let changelog = ''
      try {
        const response = await client.getModFileChangelog(modId, file.id)
        if (response.data?.data) changelog = response.data.data
      }
      catch {
        // Silently skip
      }

      return {
        fileId  : file.id,
        fileName: file.fileName,
        fileDate: file.fileDate,
        changelog,
      } as FileChangelog
    },
    concurrency
  )

  let extraBefore: FileChangelog | undefined

  if (includeExtraBefore && intermediateFiles.length > 0) {
    const oldestIntermediate = intermediateFiles[intermediateFiles.length - 1]
    const oldestDate = new Date(oldestIntermediate.fileDate).getTime()

    const extraFile = allFiles.find((f) => {
      const t = new Date(f.fileDate).getTime()
      return t < oldestDate
    })

    if (extraFile) {
      let extraChangelog = ''
      try {
        const response = await client.getModFileChangelog(modId, extraFile.id)
        if (response.data?.data) extraChangelog = response.data.data
      }
      catch {
        // Silently skip
      }

      extraBefore = {
        fileId   : asFileID(extraFile.id),
        fileName : extraFile.fileName,
        fileDate : extraFile.fileDate,
        changelog: extraChangelog,
      }
    }
  }

  if (doLogging) process.stdout.write(` (${fmtMs(performance.now() - startChangelogs)})\n`)
  return { changelogs: result, extraBefore, totalCount: intermediateTotal }
}
