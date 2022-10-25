import { declarations } from './eslint'
import { getConversion } from './parser'

export function convert(source: string): string {
  // Cut out block comments and transform without them
  const blockComments: string[] = []
  const result = source.replace(/\/\*[\s\S\n]+?\*\//gm, (m) => {
    blockComments.push(m)
    return `/* COMMENT_${blockComments.length} */`
  })

  // Return block comments
  const converted = getConversion('convert')(result)
    // Restore block comments
    .replace(/\/\* COMMENT_(\d+) \*\//g, (m, r) => blockComments[Number(r) - 1])
    // Change tabs to spaces
    .replace(/^(?<s>\s*\t\s*)/gm, s => s.replace(/\t/g, '  '))

  return declarations + converted
}

export function revert(source: string): string {
  const result = getConversion('revert')(source)
  return result
    // Remove debris
    .replace(/\n*\/\/ CONVERSION_DEBRIS[\s\S\n]+?\/\/ CONVERSION_DEBRIS\n*/gm, '')
    // Remove escaped strings
    .replace(/'(.*(\\'.*)+)'/g, (m, r) => `"${r.replace(/\\'/g, '\'')}"`)
}
