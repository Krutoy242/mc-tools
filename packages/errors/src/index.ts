export interface Config {
  boundries?: {
    from?: string
    to?  : string
  }
  groupBy?: string[]
  ignore  : string | string[]
  match   : string
  replace : { from: string, to: string }[]
}

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export async function findErrors(debugLogText: string, config: Config): Promise<string[]> {
  // Remove all errors start when client load world
  if (config.boundries) {
    const from = config.boundries.from ? debugLogText.indexOf(config.boundries.from) : 0
    const to = config.boundries.to ? debugLogText.indexOf(config.boundries.to) : debugLogText.length
    // if (from === -1) throw new Error('Starting text provided but can\'t be found')
    // if (to === -1) throw new Error('Ending text provided but can\'t be found')
    debugLogText = debugLogText.substring(from !== -1 ? from : 0, to !== -1 ? to : undefined)
    if (debugLogText.length <= 0) throw new Error('After applying boundries, no log text left')
  }

  let result: string[] = []

  const allErrors = [...debugLogText
    .matchAll(new RegExp(config.match, 'gm'))]

  if (!allErrors.length) throw new Error('No error found, probably wrong Log file')

  const ignoreRegexps = (
    Array.isArray(config.ignore)
      ? config.ignore
      : [config.ignore]
  ).map(l => new RegExp(l, 'm'))

  const replaces = config.replace.map(r => ({
    ...r,
    from: new RegExp(r.from, 'gm'),
  }))

  for (let [res] of allErrors) {
    if (ignoreRegexps.some(r => r.test(res))) continue
    replaces.forEach(r => res = res.replace(r.from, r.to))
    result.push(res)
  }

  if (config.groupBy?.length) {
    const rgxs = config.groupBy.map(s => new RegExp(s, 'm'))
    const groupFirstIndexes: number[] = Array.from({ length: rgxs.length })
    const newResult: string[][] = result.map(() => [])
    result
      .forEach((s, i) => {
        rgxs.some((rgx, j) => {
          if (rgx.test(s)) {
            if (groupFirstIndexes[j] !== undefined) {
              newResult[groupFirstIndexes[j]].push(s)
              return true
            }
            else {
              groupFirstIndexes[j] = i
              return false
            }
          }
          return false
        }) || newResult[i].push(s)
      })
    result = newResult.map(r => r.sort(naturalSort)).flat().filter(Boolean)
  }

  return result
}
