import { readFileSync, writeFileSync } from 'fs'
import merge from 'ts-deepmerge'

// @ts-check

const loadJson = f => JSON.parse(readFileSync(f, 'utf8'))

const resultObj = merge.default(
  loadJson('packages/package.json'),
  loadJson(process.argv[2])
)

writeFileSync(process.argv[2], JSON.stringify(resultObj, undefined, 2))
