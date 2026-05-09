import { formatHex, oklch } from 'culori'

/**
 * 32-bit FNV-1a hash. Stable across runs and platforms; used to seed the palette
 * from the modpack name so the same pack always gets the same colors.
 */
export function hashName(name: string): number {
  let h = 0x811C9DC5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export interface Theme {
  name         : string
  primary      : string
  /** Split-complement, +150° */
  splitA       : string
  /** Split-complement, +210° */
  splitB       : string
  /** Analogous, +30° */
  accent       : string
  success      : string
  warning      : string
  danger       : string
  /** Subtle background tint for panels. */
  panel        : string
  /** Slightly stronger tint for primary panels. */
  panelStrong  : string
  /** Barely-visible background tint for the focused row in selectors. */
  rowFocus     : string
  /** Foreground text colors */
  fg           : string
  fgDim        : string
  fgMuted      : string
  /** Per-bundle background tints for the binary search matrix. */
  bundleTints  : string[]
  /** Status colors for binary search */
  statusSuspect: string
  statusTrusted: string
  statusIgnored: string
  /** Hue (degrees) of the primary color, for downstream gradient libraries. */
  primaryHue   : number
}

const FIXED_LIGHTNESS = 0.72
const FIXED_CHROMA    = 0.16

function ok(h: number, l = FIXED_LIGHTNESS, c = FIXED_CHROMA): string {
  return formatHex(oklch({ mode: 'oklch', l, c, h: ((h % 360) + 360) % 360 })) ?? '#888'
}

/**
 * Build a Theme from a modpack name. The hue is derived from the hash so the
 * pack always gets the same colors, but lightness and chroma are fixed so the
 * palette stays balanced regardless of which hue we land on.
 */
export function buildTheme(modpackName: string): Theme {
  const h = hashName(modpackName)
  const baseHue = h % 360

  const primary = ok(baseHue)
  const splitA  = ok(baseHue + 150)
  const splitB  = ok(baseHue + 210)
  const accent  = ok(baseHue + 30)

  // Bundle tints — 8 evenly spaced hues, dim & desaturated so they read as
  // backgrounds when 1-2 colored glyphs sit on top.
  const bundleTints = Array.from({ length: 8 }, (_, i) =>
    ok((baseHue + i * 45) % 360, 0.32, 0.06))

  return {
    name         : modpackName,
    primary,
    splitA,
    splitB,
    accent,
    success      : ok(140, 0.7, 0.18),
    warning      : ok(80, 0.78, 0.18),
    danger       : ok(25, 0.65, 0.2),
    panel        : ok(baseHue, 0.22, 0.04),
    panelStrong  : ok(baseHue, 0.3,  0.07),
    rowFocus     : ok(baseHue, 0.2,  0.03),
    fg           : ok(baseHue, 0.92, 0.02),
    fgDim        : ok(baseHue, 0.65, 0.03),
    fgMuted      : ok(baseHue, 0.45, 0.02),
    bundleTints,
    statusSuspect: ok(80, 0.7, 0.16),
    statusTrusted: ok(140, 0.7, 0.18),
    statusIgnored: ok(220, 0.6, 0.06),
    primaryHue   : baseHue,
  }
}

/**
 * Pick a deterministic bundle tint index for a given bundle id, so every render
 * of the same bundle uses the same color even if the bundle list reorders.
 */
export function bundleTintIndex(bundleId: number, palette: Theme): string {
  return palette.bundleTints[bundleId % palette.bundleTints.length]
}
