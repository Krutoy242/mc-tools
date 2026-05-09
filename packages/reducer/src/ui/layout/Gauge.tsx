import { Box, Text } from 'ink'
import React from 'react'
import { useTheme } from '../ThemeContext.js'

interface GaugeProps {
  /** 0..1 */
  value   : number
  width   : number
  label?  : string
  /** Label printed at the right end (e.g. "1.2 GB"). */
  trail?  : string
  color?  : string
  /** Render label, bar and trail on separate lines when space is tight. */
  compact?: boolean
}

const FILLED = '█'
const EMPTY  = '░'

export function Gauge({ value, width, label, trail, color, compact }: GaugeProps) {
  const t = useTheme()
  const v = Math.max(0, Math.min(1, value))
  const w = Math.max(4, width)
  const filledN = Math.round(v * w)
  const emptyN  = w - filledN
  const c = color ?? t.primary

  if (compact) {
    return (
      <Box flexDirection="column">
        {label ? <Text color={t.fgDim}>{label}</Text> : null}
        <Box flexDirection="row">
          <Text color={c}>{FILLED.repeat(filledN)}</Text>
          <Text color={t.fgMuted}>{EMPTY.repeat(emptyN)}</Text>
        </Box>
        {trail ? <Text color={t.fgDim}>{trail}</Text> : null}
      </Box>
    )
  }

  return (
    <Box flexDirection="row">
      {label ? <Text color={t.fgDim}>{label.padEnd(14)}</Text> : null}
      <Text color={c}>{FILLED.repeat(filledN)}</Text>
      <Text color={t.fgMuted}>{EMPTY.repeat(emptyN)}</Text>
      {trail
        ? <Text color={t.fgDim}>
            {' '}
            {trail}
          </Text>
        : null}
    </Box>
  )
}
