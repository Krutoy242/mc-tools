import type { IgnoreNode } from '../src/index.js'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { compileConfigFromYaml, compileIgnoreFragment, compileIgnorePatterns, findErrors, parseConfig } from '../src/index.js'

// Matches any WARN/ERROR head line plus any immediately-following continuation
// lines that don't start a new `[...]` entry — enough to exercise multi-line
// entries without pulling in the full production `match` regex.
const MATCH = '\\[\\d+:\\d+:\\d+\\] \\[[^\\]]+/(WARN|ERROR)\\][^\\n]*(\\n(?!\\[).*)*'

function textsOf(log: string, ignore: unknown) {
  const config = parseConfig({ match: MATCH, ignore: ignore as string, replace: [] })
  return findErrors(log, config).map(e => e.text)
}

describe('compileIgnoreFragment', () => {
  it('turns a `*` glob into the cross-node gap', () => {
    expect(compileIgnoreFragment('Mod * is missing')).toBe('Mod [^\\n]*? is missing')
  })

  it('escapes regex metacharacters in literal text', () => {
    expect(compileIgnoreFragment('a.b(c)+d')).toBe('a\\.b\\(c\\)\\+d')
  })

  it('takes /.../-delimited text as a raw regex source, unescaped', () => {
    expect(compileIgnoreFragment('/found a face .+ with more than 4 vertices/'))
      .toBe('found a face .+ with more than 4 vertices')
  })
})

describe('compileIgnorePatterns', () => {
  it('flattens a plain string leaf as-is', () => {
    expect(compileIgnorePatterns(['literal-only'])).toEqual(['literal-only'])
  })

  it('drops empty string nodes', () => {
    expect(compileIgnorePatterns([''])).toEqual([])
  })

  it('treats a `null` child as the heading alone', () => {
    expect(compileIgnorePatterns([{ FML: null }])).toEqual(['FML'])
  })

  it('treats a scalar-string child as key + leaf concatenated (the YAML `key: value` split)', () => {
    expect(compileIgnorePatterns([{ FML: 'found a face *' }]))
      .toEqual(['FML[^\\n]*?found a face [^\\n]*?'])
  })

  it('joins a nested list of children onto their parent path, in written order', () => {
    expect(compileIgnorePatterns([{ ERROR: [{ FML: ['leaf'] }] }]))
      .toEqual(['ERROR[^\\n]*?FML[^\\n]*?leaf'])
  })

  it('compiles the same heading key repeated across separate list items into separate leaves', () => {
    expect(compileIgnorePatterns([
      { ERROR: ['first'] },
      { ERROR: ['second'] },
    ])).toEqual([
      'ERROR[^\\n]*?first',
      'ERROR[^\\n]*?second',
    ])
  })
})

describe('ignore tree semantics (via findErrors)', () => {
  it('requires level, module and message to all appear, in order, to drop an entry', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: ignored leaf message here
[15:11:40] [main/ERROR] [FML]: kept message here
[15:11:41] [main/WARN] [FML]: ignored leaf message here but WARN not ERROR
`
    const texts = textsOf(log, [{ ERROR: [{ FML: ['ignored leaf message'] }] }])
    expect(texts).toHaveLength(2)
    expect(texts.some(t => t.includes('kept message here'))).toBe(true)
    // The WARN line contains the same words but under the wrong heading, so it
    // is not dropped — level, module and message must all line up together.
    expect(texts.some(t => t.includes('ignored leaf message here but WARN not ERROR'))).toBe(true)
  })

  it('lets the same heading key repeat across separate list items, each applying independently', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: contains first-pattern text
[15:11:40] [main/ERROR] [FML]: contains second-pattern text
[15:11:41] [main/ERROR] [FML]: contains neither
`
    const texts = textsOf(log, [
      { ERROR: ['first-pattern'] },
      { ERROR: ['second-pattern'] },
    ])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('contains neither')
  })

  it('a `null` child drops every entry containing the heading alone', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: anything at all
[15:11:40] [main/ERROR] [other]: kept because module differs
`
    const texts = textsOf(log, [{ FML: null }])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('kept because module differs')
  })

  it('a scalar-string child (YAML `key: value` split) matches the same as one leaf', () => {
    const yamlConfig = `
match: '${MATCH}'
ignore:
  - FML:
      - OBJModel.Parser: found a face *
replace: []
`
    const compiled = compileConfigFromYaml(yamlConfig)
    const log = `[15:11:39] [main/ERROR] [FML]: OBJModel.Parser: found a face 5 times
[15:11:40] [main/ERROR] [FML]: unrelated message
`
    const texts = findErrors(log, compiled).map(e => e.text)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('unrelated message')

    // Sanity: the YAML text really does split on `: ` into a single-key map.
    const parsed = parseConfig(parseYaml(yamlConfig))
    const ignoreList = parsed.ignore as IgnoreNode[]
    const fml = ignoreList[0] as { FML: IgnoreNode[] }
    expect(fml.FML[0]).toEqual({ 'OBJModel.Parser': 'found a face *' })
  })

  it('a `/regex/` leaf is used as a raw RegExp', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: found a face 12 times
[15:11:40] [main/ERROR] [FML]: found a face many times
`
    const texts = textsOf(log, [{ FML: ['/found a face \\d+ times/'] }])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('found a face many times')
  })

  it('a `*` glob leaf matches any run of characters within the line', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: Mod Foo is missing
[15:11:40] [main/ERROR] [FML]: Mod Bar is missing
[15:11:41] [main/ERROR] [FML]: totally unrelated
`
    const texts = textsOf(log, [{ FML: ['Mod * is missing'] }])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('totally unrelated')
  })

  it('does not cross newlines: a heading on line 1 does not pair with a nested pattern only on a later line', () => {
    const log = `[15:11:39] [main/ERROR] [FML]: first line no nested text
second line contains nested-only-on-second-line text
`
    // Both "ERROR" and "nested-only-on-second-line" are present in the entry,
    // but only the second is on the first line — the gap must not bridge the
    // newline to pair them, so the entry stays.
    const texts = textsOf(log, [{ ERROR: ['nested-only-on-second-line'] }])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('nested-only-on-second-line')
  })
})
