const s = '[\\s\\n\\r]' as const
const sp = `${s}+` as const
const ss = `${s}*` as const
const capture = '_\\(\'[^\']+\'\\)' as const
const literal = '(\\w[\\w\\d]*)' as const
const identifier = `(${capture}|${literal})` as const
const number = '\\-?\\d+(\\.\\d+)' as const
const string = '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')' as const
const type_literal = `${literal}(\\.${literal})*` as const
const type_post1 = `((\\[${type_literal}?\\])*)` as const
const type_post2 = `((\\[${type_post1}?\\])*)` as const
const type_post = `((\\[${type_post2}?\\])*)` as const
const type = `${type_literal}(${type_post}|${type_post2}|${type_post1})*` as const
const type_assign = `as${sp}(?<type>${type})` as const
const expression_1 = `(${string}|${number}|${identifier})` as const
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
  string,
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

const conversions: { [name: string]: ReplTuple } = {

  PREPROCESSORS   : [/^\/\/\s*((?:no_fix_recipe_book|debug|loader|profile|norun|reloadable|ikwid|zslint|suppress|priority|modloaded|nowarn|notreloadable|ignoreBracketErrors|hardfail|onside|sideonly|disable_search_tree) .*$)/gm, '#$1'],
  IMPORTS         : ['import(?: type)? (?<name>[^ ]+) from \'(?<from>[^\']+)\';', ({ from, name }) => `import ${from}${name !== from.split('.').pop() ? ` as ${name}` : ''};`],
  CAPTURES        : ['\\$\\$\\$\\(\'(?<cap>[^\']+)\'\\)', ({ cap }) => `<${cap}>`],
  NUMBERPOSTFIX   : [`(?<p>${Object.values(postfixTypes).join('|')})\\((?<num>${$.number})\\)`, ({ p, num }) => num + postfixNames[p]],
  FOR_TO          : [`for \\(let (?<v>.+?) = (?<from>.+?); \\k<v> < (?<to>${$.expression}); \\k<v>\\+\\+\\) \\{`, ({ v, from, to }) => `for ${v} in ${from} .. ${to} {`],
  FOR_IN          : [/for \(const (?<v>.+?) of (?<from>[\s\S\n]+?)\)\s*\{/gm, ({ v, from }) => `for ${v} in ${from.trim()} {`],
  CONST           : [`(?<!\\()const (?<l>${$.literal})`, ({ l }) => `val ${l}`],
  LET             : [`(?<!\\()let (?<l>${$.literal})`, ({ l }) => `var ${l}`],
  STATICS         : [`\\/\\* static \\*\\/const (?<l>${$.literal})`, ({ l }) => `static ${l}`],
  WHILE_LOOP      : [/while \((.+)\) \{/gm, 'while $1 {'],
  OBJECT_STRUCTURE: [`\\{\\s?\\[(?<left>${$.expression})\\]: `, ({ left }) => `{ ${left}: `],
  CONCATENATIONS  : ['/\\* ~ \\*/\\s*\\+|\\s?\\+/\\* ~ \\*/', '~'],
  CAST_REVERT     : [/(?<a>\s*):\/\* as \*\/(?<b>\s*)/gm, ({ a, b }) => `${a || ' '}as${b || ' '}`],
}

export function revertTS_to_ZS(source: string) {
  let result = source
  const values = Object.values(conversions)
  values.reverse().forEach((c) => {
    const [from, to] = rgx(...c)
    result = result.replace(from, to as any)
  })
  return result
}
