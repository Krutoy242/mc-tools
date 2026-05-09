import UFuzzy from '@leeoniya/ufuzzy'
import { useMemo } from 'react'

export interface FuzzyResult<T> {
  item  : T
  /** Indices into the item's haystack string that matched, for highlighting. */
  ranges: number[]
  /** Score-equivalent — lower is better. */
  rank  : number
}

interface UseFuzzyOptions<T> {
  haystack: (item: T) => string
}

export function useFuzzy<T>(items: T[], query: string, opts: UseFuzzyOptions<T>): FuzzyResult<T>[] {
  const haystack = useMemo(() => items.map(opts.haystack), [items, opts.haystack])

  return useMemo(() => {
    const u = new UFuzzy({ intraIns: 1 })
    if (!query.trim()) return items.map((item, i) => ({ item, ranges: [], rank: i }))
    const idxs = u.filter(haystack, query) ?? []
    if (!idxs.length) return []
    const info = u.info(idxs, haystack, query)
    const order = u.sort(info, haystack, query)

    const out: FuzzyResult<T>[] = []
    for (let oi = 0; oi < order.length; oi++) {
      const i = order[oi]
      const itemIndex = info.idx[i]
      out.push({
        item  : items[itemIndex],
        ranges: info.ranges[i] ?? [],
        rank  : oi,
      })
    }
    return out
  }, [items, haystack, query])
}

/**
 * Apply ranges from ufuzzy to a string and return tokens with `match: boolean`,
 * suitable for rendering with two `<Text>` colors.
 */
export function highlight(str: string, ranges: number[]): { text: string, match: boolean }[] {
  if (!ranges.length) return [{ text: str, match: false }]
  const out: { text: string, match: boolean }[] = []
  let cursor = 0
  for (let i = 0; i < ranges.length; i += 2) {
    const a = ranges[i]
    const b = ranges[i + 1]
    if (a > cursor) out.push({ text: str.slice(cursor, a), match: false })
    out.push({ text: str.slice(a, b), match: true })
    cursor = b
  }
  if (cursor < str.length) out.push({ text: str.slice(cursor), match: false })
  return out
}

/**
 * Translate ranges that are relative to a longer "haystack" string into ranges
 * relative to a substring of it that starts at `offset` and has length
 * `length`. Useful when ufuzzy ran against `"name ◂file▸"` but you want to
 * highlight only the `name` or `file` portion separately.
 *
 * Ranges that fall entirely outside the substring are dropped; ranges that
 * straddle the boundary are clipped.
 */
export function sliceRanges(ranges: number[], offset: number, length: number): number[] {
  const end = offset + length
  const out: number[] = []
  for (let i = 0; i < ranges.length; i += 2) {
    const a = ranges[i]
    const b = ranges[i + 1]
    if (b <= offset || a >= end) continue
    const clippedA = Math.max(a, offset) - offset
    const clippedB = Math.min(b, end) - offset
    if (clippedB > clippedA) out.push(clippedA, clippedB)
  }
  return out
}
