import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import merge from 'ts-deepmerge'

// @ts-check

const loadJson = f => JSON.parse(readFileSync(f, 'utf8'))

const sourcePackagesJson = resolve(process.argv[2], '../../', 'package.json')
const resultObj = merge(
  loadJson(sourcePackagesJson),
  loadJson(process.argv[2])
)

writeFileSync(process.argv[2], JSON.stringify(resultObj, undefined, 2))
