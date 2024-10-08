import { readFileSync } from 'node:fs'

import { parse as csvParseSync } from 'csv-parse/sync'

export function getCSV(filename: string) {
  return csvParseSync(readFileSync(filename, 'utf8'), { columns: true }) as Record<string, string>[]
}

export function getItemNames() {
  const csv = getCSV('config/tellme/items-csv.csv')
  return csv.reduce(
    (result, o) => {
      (result[o['Registry name']] ??= {})[o['Meta/dmg']] = o['Display name']
      return result
    },
    {} as Record<string, Record<string, string>>
  )
}
