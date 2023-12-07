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

function rgx(rgxString: RegExp | string, fn: GroupReplace | string): readonly [RegExp | string, ((...args: any[]) => string) | string] {
  // console.log('rgx :>> ', new RegExp(rgxString, 'gm'))
  return [
    typeof rgxString === 'string' ? new RegExp(rgxString, 'gm') : rgxString,
    typeof fn === 'function' ? (_: string, ...args: any[]) => fn(args.pop()) : fn,
  ] as const
}

type ReplTuple = [RegExp | string, GroupReplace | string ]

const conversions: { [name: string]: ReplTuple } = {
  CLASS         : [/class(\s+\w+[\s\n]*\{)/gm, 'zenClass$1'],
  CLASS_VAL     : [/\/\* class \*\/\s*readonly/gm, 'val'],
  CLASS_STATIC  : [/\/\* class \*\/\s*static/gm, 'static'],
  CLASS_VAR     : [/\/\* class \*\/\s?/gm, 'var '],
  CLASS_FUNCTION: [/\/\* function \*\//gm, 'function'],

  ANON_FUNCTION_ARROW: [/[\s\n]?=>[\s\n]?/gm, ''],
  ANON_FUNCTION_ARGS : [/\s?_arg\d+[\s\n]*:[\s\n]?/gm, ''],

  PREPROCESSORS   : [/^import '#preprocessor (.*)';?$/gm, '#$1'],
  IMPORTS         : ['import(?: type)? (?<name>[^ ]+) from \'(?<from>[^\']+)\';', ({ from, name }) => `import ${from}${name !== from.split('.').pop() ? ` as ${name}` : ''};`],
  CAPTURES        : ['\\$\\$\\$\\(\'(?<cap>[^\']+)\'\\)', ({ cap }) => `<${cap}>`],
  NUMBERPOSTFIX   : [`(?<p>${Object.values(postfixTypes).join('|')})\\((?<num>${$.number})\\)`, ({ p, num }) => num + postfixNames[p]],
  FOR_TO          : [/for \(let (?<v>.+?) = (?<from>.+?); \k<v> < (?<to>.+?); \k<v>\+\+\) \{/gm, ({ v, from, to }) => `for ${v} in ${from} .. ${to} {`],
  FOR_IN          : [/for \(const (?<v>.+?) of (?<from>[\s\S\n]+?)\)\s*\{/gm, ({ v, from }) => `for ${v} in ${from.trim()} {`],
  STATICS         : [/\/\* (static|global) \*\/\s*const/gm, `$1`],
  REMOVE_DEBRIS   : [/\/\* _ \*\/\s*./gm, ''],
  WHILE_LOOP      : [/while \((.+)\) \{/gm, 'while $1 {'],
  OBJECT_STRUCTURE: [`\\{\\s?\\[(?<left>${$.expression})\\]: `, ({ left }) => `{ ${left}: `],
  CONCATENATIONS  : [/(?<a>\s*)\/\* ~ \*\/(?<b>\s*)\+|\+(?<c>\s*)\/\* ~ \*\/(?<d>\s*)/gm, ({ a, b, c, d }) => `${(a || b) ?? ''}~${(c || d) ?? ''}`],
  HAS             : [/\/\*\s*has\s*\*\/s*in/gm, 'has'],
  CAST_REVERT     : [/(?<a>\s*):\s*\/\* as \*\/(?<b>\s*)/gm, ({ a, b }) => `${a || ' '}as${b || ' '}`],
  RESRVED         : [/_\$_(default)/gm, '$1'],
  CONST           : [`(?<!\\()const (?<l>${$.literal})`, ({ l }) => `val ${l}`],
  LET             : [`(?<!\\()let (?<l>${$.literal})`, ({ l }) => `var ${l}`],
}

export function revertTS_to_ZS(source: string) {
  let result = source
  const values = Object.values(conversions)
  values.forEach((c) => {
    const [from, to] = rgx(...c)
    result = result.replace(from, to as any)
  })
  return result
}
