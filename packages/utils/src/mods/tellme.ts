import { readFileSync } from 'node:fs'

import { parse as csvParseSync } from 'csv-parse/sync'
import { globSync } from 'tinyglobby'

export function getCSV(filename: string) {
  return csvParseSync(readFileSync(filename, 'utf8'), { columns: true }) as Record<string, string>[]
}

export function getItemNames() {
  const csv = getCSV(globSync('config/tellme/items-csv*.csv')[0])
  return csv.reduce(
    (result, o) => {
      (result[o['Registry name']] ??= {})[o['Meta/dmg']] = o['Display name']
      return result
    },
    {} as Record<string, Record<string, string>>
  )
}
