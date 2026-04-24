import { naturalSort } from '@mctools/utils/natural-sort'
import { z } from 'zod'

export const ConfigSchema = z.object({
  boundries: z.object({
    from: z.string().optional(),
    to  : z.string().optional(),
  }).optional(),
  groupBy: z.array(z.string()).optional(),
  ignore : z.union([z.string(), z.array(z.string())]),
  match  : z.string(),
  replace: z.array(z.object({
    from: z.string(),
    to  : z.string(),
  })),
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Parse an unvalidated object (e.g. from YAML) into a Config. Throws a
 * human-readable aggregate error on schema mismatch.
 */
export function parseConfig(raw: unknown): Config {
  const res = ConfigSchema.safeParse(raw)
  if (res.success) return res.data
  const issues = res.error.issues
    .map(i => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid errors config:\n${issues}`)
}

export async function findErrors(debugLogText: string, config: Config): Promise<string[]> {
  if (config.boundries) {
    const from = config.boundries.from ? debugLogText.indexOf(config.boundries.from) : 0
    const to = config.boundries.to ? debugLogText.indexOf(config.boundries.to) : debugLogText.length
    debugLogText = debugLogText.substring(from !== -1 ? from : 0, to !== -1 ? to : undefined)
    if (debugLogText.length <= 0) throw new Error('After applying boundries, no log text left')
  }

  let result: string[] = []

  const allErrors = [...debugLogText
    .matchAll(new RegExp(config.match, 'gm'))]

  if (!allErrors.length) throw new Error('No error found, probably wrong Log file')

  const ignoreList = Array.isArray(config.ignore)
    ? config.ignore
    : [config.ignore]
  const ignoreRegexps = ignoreList.map(l => new RegExp(l, 'm'))

  const replaces = config.replace.map(r => ({
    ...r,
    from: new RegExp(r.from, 'gm'),
  }))

  for (let [res] of allErrors) {
    const matchingIndices = ignoreRegexps
      .map((r, i) => r.test(res) ? i : -1)
      .filter(i => i !== -1)

    if (matchingIndices.length > 1) {
      console.warn('Warning: Multiple ignore patterns match the same error:\n')
      console.warn(res)
      console.warn('\nMatching patterns:\n')
      for (const i of matchingIndices)
        console.warn(`- ${ignoreList[i]}`)
    }

    if (matchingIndices.length > 0) continue

    replaces.forEach(r => res = res.replace(r.from, r.to))
    result.push(res)
  }

  if (config.groupBy?.length) {
    const rgxs = config.groupBy.map(s => new RegExp(s, 'm'))
    // Use Object.groupBy (Node 24+). Errors that match no regex are placed in
    // their own identity buckets so their original order is preserved.
    const grouped = Object.groupBy(result, (s, idx) => {
      const matchIdx = rgxs.findIndex(rgx => rgx.test(s))
      return matchIdx === -1 ? `__unmatched_${idx}` : `__group_${matchIdx}`
    })
    result = Object.values(grouped)
      .map(arr => (arr as string[]).sort(naturalSort))
      .flat()
      .filter(Boolean)
  }

  return result
}
