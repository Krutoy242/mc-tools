import { useStdout } from 'ink'
import { useEffect, useState } from 'react'

export type Breakpoint = 'sm' | 'md' | 'lg'

export interface TerminalSize {
  columns   : number
  rows      : number
  breakpoint: Breakpoint
}

function bp(cols: number): Breakpoint {
  if (cols < 80) return 'sm'
  if (cols < 120) return 'md'
  return 'lg'
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout()
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns   : stdout.columns ?? 80,
    rows      : stdout.rows ?? 24,
    breakpoint: bp(stdout.columns ?? 80),
  }))

  useEffect(() => {
    const onResize = () => {
      const cols = stdout.columns ?? 80
      setSize({ columns: cols, rows: stdout.rows ?? 24, breakpoint: bp(cols) })
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  return size
}
