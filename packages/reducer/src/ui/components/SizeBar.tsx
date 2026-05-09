import { Box, Text } from 'ink'
import React from 'react'
import { useTheme } from '../ThemeContext.js'

interface SizeBarProps {
  /** Current value (e.g. mod size in bytes). */
  value   : number
  /** Reference value treated as 100% (e.g. largest mod size in the list). */
  max     : number
  /** Total bar width in cells. */
  width   : number
  /** Optional override color for the filled portion. */
  color?  : string
  /** Suppress the trailing humanized number. */
  noTrail?: boolean
}

const FRACTIONS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const FULL = '█'

export function humanSize(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/**
 * Horizontal block bar with 1/8-cell fractional fill.
 *
 * Logarithmic scale: a 50 MB mod and a 2 MB mod both render as visible bars
 * instead of one filling the whole row and the other collapsing to a point.
 * The filled portion always covers ≥1/8 of a cell when the value is non-zero,
 * so a small mod never looks like nothing. The unfilled portion uses a dim
 * full-block background instead of dots so the bar reads as a single track.
 */
export function SizeBar({ value, max, width, color, noTrail }: SizeBarProps) {
  const t = useTheme()
  const safeMax = max > 0 ? max : 1

  // log2(value+1)/log2(max+1) — gives small mods visible space without
  // requiring a per-list normalization step. Bounded to [0, 1].
  let ratio = Math.log2(Math.max(0, value) + 1) / Math.log2(safeMax + 1)
  if (!Number.isFinite(ratio)) ratio = 0
  ratio = Math.max(0, Math.min(1, ratio))

  let eighths = Math.round(ratio * width * 8)
  // Item 4: any non-zero size renders at least the 1/8 stick so the row
  // reads as "tiny but present" rather than "empty".
  if (value > 0 && eighths === 0) eighths = 1

  const full = Math.floor(eighths / 8)
  const remainder = eighths - full * 8
  const empty = Math.max(0, width - full - (remainder > 0 ? 1 : 0))
  const fillColor = color ?? t.primary

  return (
    <Box flexDirection="row">
      {full > 0 ? <Text color={fillColor}>{FULL.repeat(full)}</Text> : null}
      {remainder > 0
        ? <Text color={fillColor} backgroundColor={t.fgMuted}>{FRACTIONS[remainder]}</Text>
        : null}
      {empty > 0 ? <Text color={t.fgMuted}>{FULL.repeat(empty)}</Text> : null}
      {noTrail
        ? null
        :             <Text color={t.fgDim}>
            {' '}
            {humanSize(value)}
          </Text>}
    </Box>
  )
}
