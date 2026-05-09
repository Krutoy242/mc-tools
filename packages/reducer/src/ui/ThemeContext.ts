import type { Theme } from '../theme.js'
import { createContext, useContext } from 'react'
import { buildTheme } from '../theme.js'

const fallback = buildTheme('mctools-reducer')

export const ThemeContext = createContext<Theme>(fallback)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
