/**
 * Unwind every `__$suffix<T>` wrapper to ZS `T$suffix`. The forward pass
 * encodes `T$suffix` as a synthetic generic that survives ESLint untouched
 * (a trailing block comment could be stripped by `style/type-generic-spacing`).
 *
 * Outer-first via regex-then-balanced; nesting (e.g. `__$a<T[__$b<U>]>`) is
 * handled by the loop — each pass unwinds the leftmost wrapper, then the
 * pattern re-matches inside the rewritten body.
 */

import balanced from 'balanced-match'

// Tied to MARKERS.brandedTypePrefix — keep in sync.
const HEAD = /__\$(\w+)</

export function revertBranded(source: string): string {
  let out = source
  for (;;) {
    const m = HEAD.exec(out)
    if (!m) return out
    const open = m.index + m[0].length - 1 // position of '<'
    const b = balanced('<', '>', out.slice(open))
    if (!b) return out
    out = `${out.slice(0, m.index)}${b.body}$${m[1]}${b.post}`
  }
}
