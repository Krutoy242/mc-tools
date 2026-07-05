import { renderUsage } from 'citty'

import { describe, expect, it } from 'vitest'

import { main } from '../src/cli.js'

describe('cli smoke', () => {
  it('renders --help text correctly', async () => {
    const text = await renderUsage(main)
    expect(text.toLowerCase()).toMatch(/usage|reducer|cwd|--help/)
  })
})
