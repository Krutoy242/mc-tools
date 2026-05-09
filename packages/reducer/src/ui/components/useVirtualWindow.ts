import { useMemo } from 'react'

export interface VirtualWindow {
  start  : number
  end    : number
  /** Slice indices to render. */
  visible: number[]
}

/**
 * Compute the slice of a long list to render around a focused index. Keeps the
 * focus row inside the visible window; pads with leading items when the focus
 * approaches the bottom so the user sees stable context.
 */
export function useVirtualWindow(total: number, focus: number, height: number): VirtualWindow {
  return useMemo(() => {
    const h = Math.max(1, height)
    if (total <= h) {
      return { start: 0, end: total, visible: Array.from({ length: total }, (_, i) => i) }
    }
    let start = Math.max(0, focus - Math.floor(h / 2))
    let end = start + h
    if (end > total) {
      end = total
      start = end - h
    }
    const visible: number[] = []
    for (let i = start; i < end; i++) visible.push(i)
    return { start, end, visible }
  }, [total, focus, height])
}
