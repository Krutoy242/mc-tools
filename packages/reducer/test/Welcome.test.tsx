import { render } from 'ink-testing-library'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { Mod } from '../src/Mod.js'
import { buildTheme } from '../src/theme.js'
import { Welcome } from '../src/ui/screens/Welcome.js'
import { ThemeContext } from '../src/ui/ThemeContext.js'

describe('welcome screen', () => {
  it('renders modpack name, counts, and mode buttons', () => {
    const enabled = new Mod('foo.jar', undefined)
    const disabled = new Mod('bar.jar.disabled', undefined)
    const theme = buildTheme('TestPack')
    const { lastFrame } = render(
      <ThemeContext.Provider value={theme}>
        <Welcome
          modpackName="TestPack"
          mods={[enabled, disabled]}
          warnings={[]}
          onChoose={() => {}}
        />
      </ThemeContext.Provider>
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('TestPack')
    expect(frame).toMatch(/Manual/)
    expect(frame).toMatch(/Binary/)
  })
})
