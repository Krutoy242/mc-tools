import { Box, Text } from 'ink'
import React from 'react'
import { hashName } from '../../theme.js'
import { useTheme } from '../ThemeContext.js'

const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

interface ModIdenticonProps {
  /** Source string — typically the mod's filename or display name. */
  source : string
  /** Output box width in cells. */
  width? : number
  /** Output box height in cells. */
  height?: number
}

/**
 * Deterministic glyph-block icon generated from a string. We expand the FNV
 * hash into a per-cell sequence by repeatedly mixing it, picking a block from
 * BLOCKS for each cell. Color cycles through the theme palette.
 */
export function ModIdenticon({ source, width = 6, height = 4 }: ModIdenticonProps) {
  const t = useTheme()
  const seed = hashName(source)
  const palette = [t.primary, t.accent, t.splitA, t.splitB]

  let s = seed
  function next() {
    // xorshift32 step — cheap, plenty of mixing for 24 cells.
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= (s << 5) >>> 0
    s >>>= 0
    return s
  }

  const rows: { glyph: string, color: string }[][] = []
  for (let r = 0; r < height; r++) {
    const row: { glyph: string, color: string }[] = []
    // Mirror left half to right half so the icon is symmetric and reads as a
    // recognizable shape, like classic GitHub identicons.
    const half = Math.ceil(width / 2)
    const lefts: { glyph: string, color: string }[] = []
    for (let c = 0; c < half; c++) {
      const v = next()
      lefts.push({
        glyph: BLOCKS[(v >> 4) % BLOCKS.length],
        color: palette[v % palette.length],
      })
    }
    for (let c = 0; c < width; c++) {
      row.push(c < half ? lefts[c] : lefts[width - 1 - c])
    }
    rows.push(row)
  }

  return (
    <Box flexDirection="column">
      {rows.map((row, ri) =>
        <Box key={ri} flexDirection="row">
          {row.map((cell, ci) =>
            <Text key={ci} color={cell.color}>{cell.glyph}</Text>
          )}
        </Box>

      )}
    </Box>
  )
}
