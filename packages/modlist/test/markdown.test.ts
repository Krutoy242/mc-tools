import { describe, expect, it } from 'vitest'

import { markdownToHtml, sanitizeHtml } from '../src/utils/markdown.js'

describe('sanitizeHtml', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips <script> blocks', () => {
    expect(sanitizeHtml('<script>alert(1)</script>hello')).toBe('hello')
  })

  it('strips inline event handlers and javascript: urls', () => {
    expect(sanitizeHtml('<b onclick="x()">hi</b>')).toBe('<b>hi</b>')
    expect(sanitizeHtml('<a href="javascript:evil()">x</a>')).toBe('<a href="evil()">x</a>')
  })
})

describe('markdownToHtml', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('')
  })

  it('converts bold', () => {
    expect(markdownToHtml('**bold**')).toBe('<b>bold</b>')
  })

  it('converts links', () => {
    expect(markdownToHtml('[GitHub](https://gh.com)')).toBe('<a href="https://gh.com">GitHub</a>')
  })

  it('converts newlines to <br>', () => {
    expect(markdownToHtml('line1\nline2')).toBe('line1<br>line2')
  })

  it('wraps a list item in a <ul>', () => {
    expect(markdownToHtml('* single item')).toBe('<ul><li>single item</li></ul>')
  })
})
