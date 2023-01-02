const s = '[\\s\\n\\r]' as const
const sp = `${s}+` as const
const ss = `${s}*` as const
const capture = '_\\(\'[^\']+\'\\)' as const
const literal = '(\\w[\\w\\d]*)' as const
const identifier = `(${capture}|${literal})` as const
const number = '\\-?\\d+(\\.\\d+)' as const
const type_literal = `${literal}(\\.${literal})*` as const
const type_post1 = `((\\[${type_literal}?\\])*)` as const
const type_post2 = `((\\[${type_post1}?\\])*)` as const
const type_post = `((\\[${type_post2}?\\])*)` as const
const type = `${type_literal}(${type_post}|${type_post2}|${type_post1})*` as const
const type_assign = `as${sp}(?<type>${type})` as const
const expression_1 = `(${number}|${identifier})` as const
const getter = `(\\[${ss}${expression_1}${ss}\\]|\\.${literal})` as const
const expression = `${expression_1}${getter}*` as const

export const $ = {
  s,
  sp,
  ss,
  capture,
  literal,
  identifier,
  number,
  type,
  type_assign,
  getter,
  expression,
}

export const postfixTypes = {
  f: '__float',
  d: '__double',
  b: '__byte',
  s: '__short',
  l: '__long',
}
export const postfixNames = Object.fromEntries(
  Object.entries(postfixTypes).map(([a, b]) => [b, a])
)

type GroupReplace = (groups: Record<string, string>) => string

function rgx(rgxString: RegExp | string, fn: string | GroupReplace): readonly [string | RegExp, string | ((...args: any[]) => string)] {
  // console.log('rgx :>> ', new RegExp(rgxString, 'gm'))
  return [
    typeof rgxString === 'string' ? new RegExp(rgxString, 'gm') : rgxString,
    typeof fn === 'function' ? (_: string, ...args: any[]) => fn(args.pop()) : fn,
  ] as const
}

type ReplTuple = [RegExp | string, string | GroupReplace ]

const conversions: { [name: string]: { convert?: ReplTuple; revert?: ReplTuple } } = {

  PRAGMAS: {
    convert: [/^(.*?)#(.*)$/gm, '$1//$2'],
    revert : [/^\/\/\s*((?:priority|loader|modloaded) .*$)/gm, '#$1'],
  },

  IMPORTS: {
    convert: [/import\s+(?<source>\w+(\.\w+)*)(\s+as\s+(?<alias>\w+))?\s*;/gm, ({ source, alias }) =>
      `import ${alias ?? source.split('.').pop()} from '${source}';`,
    ],
    revert: [
      'import (?<name>[^ ]+) from \'(?<from>[^\']+)\';',
      ({ from, name }) => `import ${from}${name !== from.split('.').pop() ? ` as ${name}` : ''};`,
    ],
  },

  CAPTURES: {
    convert: [/<([\w-]+(?::[\w\d\-\*\.=]+)+)>/gm, '__(\'$1\')'],
    revert : [
      '__\\(\'(?<cap>[^\']+)\'\\)',
      ({ cap }) => `<${cap}>`,
    ],
  },

  NUMBERPOSTFIX: {
    convert: [`(?<num>${$.number})(?<postfix>[fFdD])`,
      ({ num, postfix }) => `${postfixTypes[postfix.toLowerCase()]}(${num})`,
    ],
    revert: [
      `(?<p>${Object.values(postfixTypes).join('|')})\\((?<num>${$.number})\\)`,
      ({ p, num }) => num + postfixNames[p],
    ],
  },

  VARIABLES: {
    convert: [/val\s+(\w+)/gm, 'const $1'],
    revert : [`const (?<l>${$.literal})`, ({ l }) => `val ${l}`],
  },

  STATICS: {
    convert: [/static\s+(\w+)/gm, '/* static */const $1'],
    revert : [`\\/\\* static \\*\\/const (?<l>${$.literal})`, ({ l }) => `static ${l}`],
  },

  FOR_TO: {
    convert: [
      `for${$.sp}(?<vars>${$.literal})${$.sp}in${$.sp}(?<from>${$.expression})${$.sp}(?:to${$.sp}|\\.\\.${$.ss})(?<to>${$.expression})${$.ss}\\{`,
      ({ vars, from, to }) => `for (let ${vars} = ${from}; ${vars} < ${to}; ${vars}++) {`,
    ],
    revert: [
      `for \\(let (?<v>.+?) = (?<from>.+?); \\k<v> < (?<to>${$.expression}); \\k<v>\\+\\+\\) \\{`,
      ({ v, from, to }) => `for ${v} in ${from} .. ${to} {`,
    ],
  },

  FOR_IN: {
    convert: [
      /for\s+(?<vars>\w+\s*(?:,\s*\w+)*)\s+in\s+(?<from>[^{]+)\s*\{/gm,
      'for (const { $1 } of $2) {',
    ],
    revert: [
      'for \\(const \\{ (?<v>[^}]+)\\} of (?<from>[\\s\\S\\n]+?)\\) \\{',
      ({ v, from }) => `for ${v}in ${from.trim()} {`,
    ],
  },

  WHILE_LOOP: {
    convert: [/\bwhile\s+(.+)\{/gm, 'while ($1) {'],
    revert : [/while \((.+)\) \{/gm, 'while $1 {'],
  },

  OBJECT_STRUCTURE: {
    convert: [
    `{${$.ss}(?<left>${$.expression})${$.ss}:${$.ss}(?<right>${$.expression})${$.ss}}`,
    ({ left, right }) => `{${
        new RegExp(`^${$.literal}$`, 'gm').test(left)
        ? left
        : `[${left}]`
      }: ${right}}`,
    ],
    revert: [
      `\\{\\s?\\[(?<left>${$.expression})\\]: `,
      ({ left }) => `{ ${left}: `,
    ],
  },

  HAS: {
    convert: [new RegExp(`(${$.expression})${$.sp}has${$.sp}(${$.expression})`, 'gm'), '$1 in $2'],

  },

  CONCATENATIONS: {
    convert: [/\s*~/gm, '/* ~ */ +'],
    revert : ['/\\* ~ \\*/ \\+|\\s?\\+/\\* ~ \\*/', ' ~'],
  },

  PARAM_TYPE: {
    convert: [
      `(?<=function${$.sp}${$.literal}[^;{}]+)${$.sp}${$.type_assign}`,
      ':/* cast param */ $<type>',
    ],
  },

  PARAM_TYPE_ANON: {
    convert: [
      `(?<=function${$.ss}\\(${$.ss}${$.literal})${$.sp}${$.type_assign}`,
      ':/* cast param */ $<type>',
    ],
  },

  DEFINE_TYPE: {
    convert: [
      `(?<=(const|var)${$.sp}${$.literal})${$.sp}${$.type_assign}(?=${$.ss}[=;])`,
      ':/* cast def */ $<type>',
    ],
  },

  CAST_REVERT: {
    revert: [/:\/\* cast( \w+)? \*\/ /gm, ' as '],
  },

  RESERVED_WORDS: {
    convert: [/\b(default)\b/gmi, '__literal_$1'],
    revert : [/\b__literal_(\w+)\b/gmi, '$1'],
  },
}

export function getConversion(way: 'convert' | 'revert') {
  return (source: string): string => {
    let result = source
    const values = Object.values(conversions)
    ;(way === 'convert' ? values : values.reverse()).forEach((c) => {
      const t = c[way]
      if (!t) return
      const [from, to] = rgx(...t)
      result = result.replace(from, to as any)
    })
    return result
  }
}
