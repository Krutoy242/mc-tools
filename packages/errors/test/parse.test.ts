import { describe, expect, it } from 'vitest'
import { parseEntry } from '../src/parse.js'

describe('parseEntry', () => {
  it('parses thread, level, module and message from a normal entry', () => {
    const r = parseEntry('[15:11:39] [main/ERROR] [FML]: plain message')
    expect(r).toEqual({
      thread : 'main',
      level  : 'ERROR',
      module : 'FML',
      message: 'plain message',
    })
  })

  it('keeps the remainder of a multi-line entry as body', () => {
    const r = parseEntry('[15:11:39] [main/ERROR] [FML]: head\nline two\nline three')
    expect(r.message).toBe('head')
    expect(r.body).toBe('line two\nline three')
  })

  it('falls back to the raw text as message when the head does not match', () => {
    const r = parseEntry('no brackets at all here')
    expect(r).toEqual({ message: 'no brackets at all here' })
  })

  // `[ModDirector[CORE]]` — the module itself contains a bracketed group. A
  // module pattern that stops at the first `]` would truncate this to
  // "ModDirector" and leave a dangling "]" that breaks the whole match.
  it('parses a module name that itself contains a bracketed group', () => {
    const r = parseEntry('[15:11:39] [main/ERROR] [ModDirector[CORE]]: message text')
    expect(r.module).toBe('ModDirector[CORE]')
    expect(r.message).toBe('message text')
  })

  // `[ModDirector/ForgeLateLoader[Launchwrapper]]` — a slash-separated module
  // name plus a bracketed group, both inside the outer module brackets.
  it('parses a module name with a slash and a bracketed group', () => {
    const r = parseEntry('[15:11:39] [main/ERROR] [ModDirector/ForgeLateLoader[Launchwrapper]]: message text')
    expect(r.module).toBe('ModDirector/ForgeLateLoader[Launchwrapper]')
    expect(r.message).toBe('message text')
  })

  // A greedy module match that runs past the real closing `]` would instead
  // stop at the last `]: ` on the line — inside the message — truncating it.
  it('does not let the module swallow a message that itself contains "]: "', () => {
    const r = parseEntry('[15:11:39] [main/ERROR] [FML]: Item foo]: still part of message')
    expect(r.module).toBe('FML')
    expect(r.message).toBe('Item foo]: still part of message')
  })

  it('parses an entry without a leading timestamp', () => {
    const r = parseEntry('[main/ERROR] [FML]: message text')
    expect(r).toEqual({
      thread : 'main',
      level  : 'ERROR',
      module : 'FML',
      message: 'message text',
    })
  })
})
