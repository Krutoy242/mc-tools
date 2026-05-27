export const SANITIZE_NEWLINES_REGEX = /\n/g
export const SANITIZE_MARKDOWN_REGEX = /([|`*_])/g

export function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms.toFixed(0)}ms`
}

export function extractVersionLabel(fileName: string): string | undefined {
  const base = fileName.replace(/\.jar$/, '')
  const parts = base.split('-')
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^v?\d/.test(parts[i])) {
      return parts.slice(i).join('-')
    }
  }
  return undefined
}

/**
 * Execute async tasks with a concurrency limit.
 * @param items Array of items to process
 * @param fn Async function to apply to each item
 * @param concurrency Maximum number of concurrent tasks
 * @returns Array of results in the same order as input
 */
export async function runConcurrent<T, R>(
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
