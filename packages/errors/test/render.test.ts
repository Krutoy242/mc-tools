import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pickFormat, renderMarkdown, renderPlain, renderTerminal } from '../src/render.js'

describe('pickFormat', () => {
  it('returns terminal for undefined output with TTY', () => {
    expect(pickFormat(undefined, true)).toBe('terminal')
  })
  it('returns plain for undefined output without TTY', () => {
    expect(pickFormat(undefined, false)).toBe('plain')
  })
  it('returns markdown for .md output', () => {
    expect(pickFormat('out.md', false)).toBe('markdown')
    expect(pickFormat('OUT.MD', true)).toBe('markdown')
  })
  it('returns plain for .log output', () => {
    expect(pickFormat('out.log', false)).toBe('plain')
    expect(pickFormat('out.log', true)).toBe('plain')
  })
  it('returns plain for other output', () => {
    expect(pickFormat('out.txt', false)).toBe('plain')
  })
})

describe('renderPlain', () => {
  it('renders correctly', () => {
    expect(renderPlain([])).toBe('')
    expect(renderPlain([{ text: 'a', line: 1 }, { text: 'b', line: 2 }])).toBe('a\nb')
  })
})

describe('renderTerminal', () => {
  let oldColor: string | undefined
  beforeAll(() => {
    oldColor = process.env.FORCE_COLOR
    process.env.FORCE_COLOR = '1'
  })
  afterAll(() => {
    if (oldColor === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = oldColor
  })

  it('renders colored text', () => {
    const text = renderTerminal([
      { text: '[main/ERROR] [FML]: foo\nbar', line: 1, time: '15:11:39' },
      { text: '[Client thread/WARN] [mixin]: warn', line: 2, time: '15:11:45' },
      { text: '[Client thread/INFO] [foo]: info', line: 3, time: '16:07:31' },
      { text: 'weird', line: 4 },
    ])
    expect(text).toContain('\x1B[31mERROR\x1B[39m') // red
    expect(text).toContain('\x1B[33mWARN\x1B[39m') // yellow
    expect(text).toContain('\x1B[2m15:11:39\x1B[22m') // dim
    expect(text).toContain('\x1B[2mweird\x1B[22m') // dim
  })

  it('renders colored text with missing parts', () => {
    const text = renderTerminal([
      { text: '[main/ERROR] [FML]: foo\nbar', line: 1 }, // missing time
      { text: '[/ERROR] []: foo', line: 2, time: '15:11:39' }, // missing thread and module
      { text: '[main/] [FML]: foo', line: 3, time: '15:11:39' }, // missing level
      { text: '[main/ERROR] []: foo', line: 4, time: '15:11:39' }, // missing module
      { text: '[main/ERROR] [FML]: foo', line: 5, time: '15:11:39' }, // missing body
    ])
    expect(text).toContain('\x1B[31mERROR\x1B[39m') // red
  })
})

describe('renderMarkdown', () => {
  it('renders empty', () => {
    expect(renderMarkdown([])).toBe('')
  })

  it('renders stable output across time shifts', () => {
    const errors1 = [
      { text: '[main/ERROR] [FML]: first', line: 1, time: '15:11:39' },
      { text: '[main/ERROR] [FML]: second', line: 2, time: '15:15:39' },
    ]
    const errors2 = [
      { text: '[main/ERROR] [FML]: first', line: 1, time: '20:11:39' },
      { text: '[main/ERROR] [FML]: second', line: 2, time: '20:15:39' },
    ]
    expect(renderMarkdown(errors1)).toBe(renderMarkdown(errors2))
    expect(renderMarkdown(errors1)).toContain('# Errors report')
    expect(renderMarkdown(errors1)).toContain('mermaid')
    expect(renderMarkdown(errors1)).toContain('### <a id="err-1">')
    expect(renderMarkdown(errors1)).toContain('🔴')
    expect(renderMarkdown(errors1)).toContain('Thread: `main`')
  })

  it('handles midnight wrap-around', () => {
    const text = renderMarkdown([
      { text: '[main/ERROR] [FML]: first', line: 1, time: '23:59:50' },
      { text: '[main/ERROR] [FML]: second', line: 2, time: '00:00:10' },
    ])
    expect(text).toContain('+0min : first')
  })

  it('handles missing time entries fallback to +0min', () => {
    const text = renderMarkdown([
      { text: '[main/ERROR] [FML]: first', line: 1 },
      { text: '[main/ERROR] [FML]: second', line: 2 },
    ])
    expect(text).toContain('+0min : first')
    expect(text).toContain('      : second')
  })

  it('handles some missing time entries', () => {
    const text = renderMarkdown([
      { text: 'weird', line: 1 },
      { text: '[main/ERROR] [FML]: second\nbody line', line: 2, time: '00:00:10' },
      { text: '[Client thread/WARN] [mixin]: actual valid warn message', line: 3, time: '00:00:10' },
      { text: '[/ERROR] []: missing thread and module', line: 4, time: '00:00:10' },
      { text: '[main/] [FML]: missing level', line: 5, time: '00:00:10' },
      { text: 'completely malformed', line: 6, time: '00:00:10' },
    ])
    expect(text).toContain('+0min : weird')
    expect(text).toContain('      : second')
    expect(text).toContain('      : actual valid warn message')
    expect(text).toContain('      : [/ERROR] []\\: missing thread and module')
    expect(text).toContain('      : [main/] [FML]\\: missing level')
    expect(text).toContain('completely malformed')
    expect(text).toContain('body line')
  })

  it('truncates very long messages and escapes characters', () => {
    const text = renderMarkdown([
      { text: '[main/ERROR] [FML]: very long message # : that exceeds eighty characters so it can test the title truncation branch successfully for coverage', line: 1, time: '00:00:10' },
    ])
    expect(text).toContain('very long message \\# \\: that exceeds eigh…')
    expect(text).toContain('very long message # : that exceeds eighty characters so it can test the title t…')
  })
})
