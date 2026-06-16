import type { Logger } from '../src/core/logger.js'

import { compileConfig, parseConfig } from '@mctools/errors'
import { describe, expect, it } from 'vitest'

import { DebugLogEngine } from '../src/features/debug-log/engine.js'

const config = compileConfig(parseConfig({ match: '.*ERROR.*', ignore: '', replace: [] }))
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as Logger

describe('debugLogEngine', () => {
  it('returns matched errors with chunk-adjusted line numbers', () => {
    const engine = new DebugLogEngine(config, logger)
    const novel = engine.processChunk({ text: 'info\n[main/ERROR] boom\nok', startLine: 100, isTruncated: false })
    expect(novel).toHaveLength(1)
    expect(novel[0].text).toContain('boom')
    expect(novel[0].line).toBe(101)
  })

  it('dedupes identical errors across chunks', () => {
    const engine = new DebugLogEngine(config, logger)
    const chunk = { text: 'info\n[main/ERROR] boom\nok', startLine: 0, isTruncated: false }
    expect(engine.processChunk(chunk)).toHaveLength(1)
    expect(engine.processChunk(chunk)).toHaveLength(0)
  })

  it('reset() clears the known-error set', () => {
    const engine = new DebugLogEngine(config, logger)
    const chunk = { text: '[main/ERROR] boom', startLine: 0, isTruncated: false }
    expect(engine.processChunk(chunk)).toHaveLength(1)
    engine.reset()
    expect(engine.processChunk(chunk)).toHaveLength(1)
  })
})
