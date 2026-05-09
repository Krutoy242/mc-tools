import { Box, Text } from 'ink'
import React from 'react'

export interface GlyphCell {
  glyph: string
  color: string
}

interface GlyphGridProps {
  cells: GlyphCell[]
  /** Max width in cells; the grid wraps to multiple rows. */
  width: number
}

/**
 * Render a grid of `(glyph, color)` cells. Calling code is responsible for
 * mapping its domain data (mod depth, size, status, …) onto the cell list,
 * so this component stays presentation-only.
 */
export function GlyphGrid({ cells, width }: GlyphGridProps) {
  const rows: GlyphCell[][] = []
  for (let i = 0; i < cells.length; i += width) rows.push(cells.slice(i, i + width))

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
