import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import peggy from 'peggy'

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

let parser: peggy.Parser

export function peggyParse(text: string) {
  parser ??= initParser()
  return parser.parse(text)
}

function initParser() {
  const filePath = relative('zenscript.peggy')
  const fileContent = readFileSync(filePath, 'utf8')
  return peggy.generate(fileContent, { cache: true })
}
