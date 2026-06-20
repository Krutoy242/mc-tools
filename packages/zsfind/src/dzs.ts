import type { Source } from './sources.ts'
import fs from 'fs-extra'
import { basename, join } from 'pathe'

export interface ParsedDzs {
  source       : Source
  file         : string
  content      : string
  imports      : Record<string, string>
  className    : string
  classFullName: string
  isExpansion  : boolean
}

export interface Member {
  kind       : 'field' | 'method' | 'constructor'
  raw        : string
  returnType?: string
}

const PRIMITIVES = new Set([
  'bool',
  'byte',
  'short',
  'int',
  'long',
  'float',
  'double',
  'string',
  'void',
  'any',
])

function pathToClassName(file: string, native: boolean): string {
  const dotted = file.replace(/\.dzs$/, '').replace(/\//g, '.')
  return native ? `native.${dotted}` : dotted
}

export async function parseDzs(source: Source, file: string): Promise<ParsedDzs> {
  const content = await fs.readFile(join(source.root, file), 'utf-8')
  const className = basename(file, '.dzs')
  const classFullName = pathToClassName(file, source.native)

  const imports: Record<string, string> = {}
  let isExpansion = false

  for (const line of content.split('\n')) {
    const match = line.match(/^import\s+([\w.]+);/)
    if (!match)
      continue
    const fullImport = match[1]
    const shortName = fullImport.split('.').pop()!
    imports[shortName] = fullImport
    if (shortName === className)
      isExpansion = true
  }

  imports[className] = classFullName

  return { source, file, content, imports, className, classFullName, isExpansion }
}

export function expandTypes(text: string, imports: Record<string, string>): string {
  const names = Object.keys(imports).sort((a, b) => b.length - a.length)
  if (names.length === 0)
    return text
  const regex = new RegExp(`\\b(${names.map(escapeRegex).join('|')})\\b`, 'g')
  return text.replace(regex, name => imports[name] ?? name)
}

function baseTypeOf(type: string): string {
  return type.replace(/[[\]]/g, '').trim().split('<')[0].trim()
}

export function findMembers(content: string, name: string): Member[] {
  const members: Member[] = []
  const escaped = escapeRegex(name)

  const fieldRe = new RegExp(`^\\s*(?:val|var)\\s+${escaped}\\s+as\\s+([^;]+);`, 'gm')
  for (const m of content.matchAll(fieldRe)) {
    members.push({ kind: 'field', raw: m[0].trim(), returnType: usefulType(baseTypeOf(m[1])) })
  }

  const methodRe = new RegExp(
    `^\\s*(?:static\\s+)?function\\s+${escaped}\\s*\\([^)]*\\)(?:\\s*as\\s+([^;]+))?;`,
    'gm'
  )
  for (const m of content.matchAll(methodRe)) {
    members.push({ kind: 'method', raw: m[0].trim(), returnType: m[1] ? usefulType(baseTypeOf(m[1])) : undefined })
  }

  if (name === 'zenConstructor' || name === 'new') {
    const ctorRe = /^\s*zenConstructor\s*\([^)]*\);/gm
    for (const m of content.matchAll(ctorRe))
      members.push({ kind: 'constructor', raw: m[0].trim() })
  }

  return members
}

function usefulType(type: string): string | undefined {
  return type && !PRIMITIVES.has(type) ? type : undefined
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
