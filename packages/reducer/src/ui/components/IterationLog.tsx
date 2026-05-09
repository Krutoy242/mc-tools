import { Box, Text } from 'ink'
import React from 'react'
import { useTheme } from '../ThemeContext.js'

export interface IterationEntry {
  index       : number
  enabled     : number
  disabled    : number
  /** undefined = pending, true = bug present, false = bug gone */
  bugPersists?: boolean
}

interface IterationLogProps {
  entries: IterationEntry[]
}

export function IterationLog({ entries }: IterationLogProps) {
  const t = useTheme()
  if (!entries.length) return <Text color={t.fgMuted}>no iterations yet</Text>
  return (
    <Box flexDirection="column">
      {entries.slice(-8).map((e) => {
        const verdict = e.bugPersists === undefined
          ? <Text color={t.warning}>pending</Text>
          : e.bugPersists
            ? <Text color={t.danger}>persisted</Text>
            : <Text color={t.success}>cleared</Text>
        return (
          <Box key={e.index}>
            <Text color={t.fgMuted}>
              #
              {String(e.index).padStart(2, ' ')}
              {' '}
            </Text>
            <Text color={t.success}>
              +
              {e.enabled}
            </Text>
            <Text color={t.fgMuted}>/</Text>
            <Text color={t.danger}>
              -
              {e.disabled}
            </Text>
            <Text>{'  '}</Text>
            {verdict}
          </Box>
        )
      })}
    </Box>
  )
}
