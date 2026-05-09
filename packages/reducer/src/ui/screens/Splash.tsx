import { Box, Text } from 'ink'
// @ts-expect-error - ink-big-text ships untyped
import BigText from 'ink-big-text'
import Gradient from 'ink-gradient'
import React, { useEffect, useState } from 'react'
import { useTheme } from '../ThemeContext.js'

interface SplashProps {
  modpackName: string
  onDone     : () => void
  /** ms before we transition to the next screen */
  duration?  : number
}

export function Splash({ modpackName, onDone, duration = 1200 }: SplashProps) {
  const t = useTheme()
  const [phase, setPhase] = useState<0 | 1 | 2>(0)

  useEffect(() => {
    const a = setTimeout(setPhase, duration * 0.4, 1)
    const b = setTimeout(setPhase, duration * 0.75, 2)
    const c = setTimeout(onDone, duration)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
      clearTimeout(c)
    }
  }, [duration, onDone])

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Gradient colors={[t.primary, t.accent, t.splitA]}>
        <BigText text="REDUCER" font="chrome" />
      </Gradient>
      <Box marginTop={1}>
        <Text color={t.fgDim}>◂ booting modpack control surface ▸</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={t.accent}>{phase >= 1 ? '◆ ' : '◇ '}</Text>
        <Text color={phase >= 1 ? t.fg : t.fgMuted}>scanning modpack</Text>
        <Text>  </Text>
        <Text color={t.accent}>{phase >= 2 ? '◆ ' : '◇ '}</Text>
        <Text color={phase >= 2 ? t.fg : t.fgMuted}>resolving dependencies</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={t.fgMuted}>«  </Text>
        <Text color={t.primary} bold>
          {modpackName}
        </Text>
        <Text color={t.fgMuted}>  »</Text>
      </Box>
    </Box>
  )
}
