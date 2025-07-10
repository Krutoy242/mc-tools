import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { merge } from 'ts-deepmerge'

// @ts-check

const loadJson = f => JSON.parse(readFileSync(f, 'utf8'))

const sourcePackagesJson = resolve(process.argv[2], '../../', 'package.json')
const template = Object.entries(loadJson(sourcePackagesJson))
const actualObj = loadJson(process.argv[2])
const actual = Object.entries(actualObj)
let resultObj = {}

// Keep top-level order of both files
let shift = 0
for (let i = 0; i < template.length; i++) {
  const [k, v] = template[i]
  while (i + shift < actual.length && actual[i + shift][0] !== k) {
    resultObj[actual[i + shift][0]] = actual[i + shift][1]
    shift++
  }
  resultObj[k] = v
}
resultObj = merge(resultObj, actualObj)

writeFileSync(process.argv[2], `${JSON.stringify(resultObj, undefined, 2)}\n`)
