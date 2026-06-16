import { describe, expect, it } from 'vitest'

import { genericParser } from '../src/features/crafttweaker-log/parsers/generic.js'

describe('genericParser', () => {
  it('parses an ERROR line, stripping bracket prefixes', () => {
    const parsed = genericParser.tryParse(['[ERROR] [FML]: something bad'], 0, '')
    expect(parsed?.result.severity).toBe('error')
    expect(parsed?.result.message).toBe('something bad')
    expect(parsed?.result.originLine).toBe(0)
  })

  it('maps WARNING to warning severity', () => {
    const parsed = genericParser.tryParse(['[WARNING]: heads up'], 0, '')
    expect(parsed?.result.severity).toBe('warning')
  })

  it('returns undefined for lines without a log level', () => {
    expect(genericParser.tryParse(['just a normal line'], 0, '')).toBeUndefined()
  })
})
