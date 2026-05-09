import { Text } from 'ink'
import React from 'react'
import { useTheme } from '../ThemeContext.js'

interface StatusChipProps {
  label  : string
  count? : number
  variant: 'success' | 'warning' | 'danger' | 'info' | 'accent'
}

export function StatusChip({ label, count, variant }: StatusChipProps) {
  const t = useTheme()
  const color
    = variant === 'success'
      ? t.success
      : variant === 'warning'
        ? t.warning
        : variant === 'danger'
          ? t.danger
          : variant === 'accent'
            ? t.accent
            : t.splitA
  return (
    <Text color={color}>
      {' ▌'}
      <Text bold>{label}</Text>
      {count !== undefined
        ? <Text>
            {' '}
            {count}
          </Text>

        : null}
      {' '}
    </Text>
  )
}
