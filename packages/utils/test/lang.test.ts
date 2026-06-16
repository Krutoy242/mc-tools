import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Lang } from '../src/lang.js'

// `Lang` resolves files relative to cwd (`resources/<owner>/lang/`), so each
// test runs inside a throwaway temp dir with a minimal lang file.
describe('lang', () => {
  let cwd: string

  beforeEach(() => {
    cwd = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), 'mctools-lang-'))
    process.chdir(dir)
    mkdirSync('resources/owner/lang', { recursive: true })
    writeFileSync(
      'resources/owner/lang/en_us.lang',
      '#PARSE_ESCAPES\nkey.a=Hello §aWorld\nkey.b=Bye\n'
    )
  })

  afterEach(() => {
    process.chdir(cwd)
  })

  it('reads a value for an existing key', () => {
    expect(new Lang('owner').get('key.b')).toBe('Bye')
  })

  it('returns the key itself when it is missing', () => {
    expect(new Lang('owner').get('key.missing')).toBe('key.missing')
  })

  it('strips § formatting codes in getClear', () => {
    expect(new Lang('owner').getClear('key.a')).toBe('Hello World')
  })

  it('save() writes the #PARSE_ESCAPES header and new entries', () => {
    const lang = new Lang('owner')
    lang.set('key.c', 'New value')
    lang.save()
    const out = readFileSync('resources/owner/lang/en_us.lang', 'utf8')
    expect(out.startsWith('#PARSE_ESCAPES\n')).toBe(true)
    expect(out).toContain('key.c=New value')
  })
})
