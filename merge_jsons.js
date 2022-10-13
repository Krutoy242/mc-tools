import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import merge from 'ts-deepmerge'

// @ts-check

const loadJson = f => JSON.parse(readFileSync(f, 'utf8'))

const sourcePackagesJson = resolve(process.argv[2], '../../', 'package.json')
const resultObj = merge.default(
  loadJson(sourcePackagesJson),
  loadJson(process.argv[2])
)

writeFileSync(process.argv[2], JSON.stringify(resultObj, undefined, 2))
