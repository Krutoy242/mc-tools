import type { ReactNode } from 'react'
import { Box, Text } from 'ink'
import React from 'react'
import { useTheme } from '../ThemeContext.js'

interface PanelProps {
  title?      : string
  subtitle?   : string
  variant?    : 'default' | 'strong' | 'accent' | 'danger'
  width?      : number | string
  height?     : number | string
  flexGrow?   : number
  flexShrink? : number
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic'
  children    : ReactNode
}

export function Panel({
  title,
  subtitle,
  children,
  variant = 'default',
  width,
  height,
  flexGrow,
  flexShrink,
  borderStyle = 'round',
}: PanelProps) {
  const t = useTheme()
  const borderColor
    = variant === 'accent'
      ? t.accent
      : variant === 'danger'
        ? t.danger
        : variant === 'strong'
          ? t.primary
          : t.fgMuted

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      width={width}
      height={height}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
    >
      {title !== undefined
        && <Box marginBottom={subtitle ? 0 : 1}>
          <Text bold color={variant === 'default' ? t.fg : borderColor}>
            {title}
          </Text>
          {subtitle
            ? <Text color={t.fgMuted}>
                {'  '}
                {subtitle}
              </Text>
            : null}
        </Box>}
      {children}
    </Box>
  )
}
