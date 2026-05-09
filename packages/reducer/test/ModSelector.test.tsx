import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { Mod } from '../src/Mod.js'
import { buildTheme } from '../src/theme.js'
import { ModSelector } from '../src/ui/components/ModSelector.js'
import { ThemeContext } from '../src/ui/ThemeContext.js'

describe('modSelector', () => {
  it('renders the supplied mods', () => {
    const a = new Mod('alpha.jar', undefined)
    const b = new Mod('beta.jar', undefined)
    const theme = buildTheme('X')
    const { lastFrame } = render(
      <ThemeContext.Provider value={theme}>
        <ModSelector
          mods={[a, b]}
          onComplete={() => {}}
          onCancel={() => {}}
          title="Test selector"
        />
      </ThemeContext.Provider>
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Test selector')
    expect(frame).toMatch(/alpha|beta/)
  })
})
