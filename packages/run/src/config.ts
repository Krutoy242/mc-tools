import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export interface Config { [name: string]: string }

function assertPath(f: string, errorText?: string) {
  if (existsSync(f)) return f
  throw new Error(`${resolve(f)} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}

export function loadConfig(filePath: string) {
  const config = JSON.parse(readFileSync(assertPath(filePath), 'utf8')) as Config
  if (!Object.keys(config).length) throw new Error('Config should have at least 1 entry')
  return config
}
