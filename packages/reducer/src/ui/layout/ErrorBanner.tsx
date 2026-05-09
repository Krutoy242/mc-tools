import { Box, Text } from 'ink'
import React from 'react'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { useTheme } from '../ThemeContext.js'

interface ErrorBannerProps {
  messages  : string[]
  onDismiss?: () => void
}

const VISIBLE_LINES = 2

/**
 * A bordered banner pinned at the top of the app. Limits itself to a small,
 * predictable height (header + 2 messages + optional "more" line) so it never
 * overflows the viewport even when many errors arrive in succession.
 */
export function ErrorBanner({ messages }: ErrorBannerProps) {
  const t = useTheme()
  const { columns } = useTerminalSize()
  if (!messages.length) return null

  // Reserve room for the rounded border, padding, and a small gutter.
  const innerWidth = Math.max(20, columns - 6)
  const visible = messages.slice(-VISIBLE_LINES)
  const extra = messages.length - visible.length

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={t.danger}
      paddingX={1}
      width="100%"
    >
      <Text bold color={t.danger}>
        {`⚠ ${messages.length} error${messages.length === 1 ? '' : 's'}`}
        <Text color={t.fgMuted}>
          {'   '}
          [x] dismiss
        </Text>
      </Text>
      {visible.map((m, i) =>
        <Text key={i} color={t.fgDim} wrap="truncate">
          {' '}
          {truncate(m, innerWidth)}
        </Text>
      )}
      {extra > 0
        ?             <Text color={t.fgMuted}>
            {' '}
          …and
            {' '}
            {extra}
            {' '}
          more
          </Text>

        : null}
    </Box>
  )
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1))}…`
}
