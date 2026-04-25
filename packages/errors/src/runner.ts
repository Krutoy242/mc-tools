import type { CompiledConfig, FoundError } from './index.js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'
import {
  compileConfig,

  findErrors,

  parseConfig,
} from './index.js'
import { pickFormat, renderMarkdown, renderPlain, renderTerminal } from './render.js'

// In a SEA build `import.meta.url` is not a real file URL, so guard the
// default-path construction. The asset fallback in `loadConfig` covers SEA.
// The catch branch is only hit inside a SEA binary and cannot be exercised
// from a normal vitest run.
/* v8 ignore start */
export const DEFAULT_CONFIG = (() => {
  try {
    return fileURLToPath(new URL('config.yml', import.meta.url))
  }
  catch {
    return 'config.yml'
  }
})()
/* v8 ignore stop */

export interface CliArgs {
  log   : string
  config: string
  output: string | undefined
}

export async function tryLoadSeaAsset(name: string): Promise<string | null> {
  // `node:sea` only resolves inside Node builds that ship the module; on
  // older runtimes it would throw, so swallow the rejection. Both the
  // not-SEA path and the SEA-asset path are covered via vi.doMock.
  const sea = await import('node:sea').catch(/* v8 ignore next */() => null)
  if (sea === null || !sea.isSea()) return null
  return new TextDecoder().decode(sea.getAsset(name))
}

export async function loadConfig(path: string, isDefault: boolean): Promise<CompiledConfig> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  }
  catch {
    raw = await loadDefaultFallback(path, isDefault)
  }
  return compileConfig(parseConfig(parseYaml(raw)))
}

async function loadDefaultFallback(path: string, isDefault: boolean): Promise<string> {
  if (!isDefault) throw new Error(`Config file not found: ${resolve(path)}`)
  const sea = await tryLoadSeaAsset('config.yml')
  if (sea !== null) return sea
  throw new Error(`Config file not found: ${resolve(path)}`)
}

export async function loadLog(path: string): Promise<string> {
  let log: string
  try {
    log = await readFile(path, 'utf8')
  }
  catch {
    throw new Error(`${resolve(path)} doesnt exist. Provide correct path for debug.log`)
  }
  if (log.length < 100)
    throw new Error(`${resolve(path)} exist but too short. Probably wrong file.`)
  return log
}

export async function writeOutput(
  errors: FoundError[],
  output: string | undefined,
  /* v8 ignore next */
  isTTY: boolean = !!process.stdout.isTTY
): Promise<void> {
  if (errors.length)
    process.stdout.write(`Found ${errors.length} errors\n`)

  const fmt = pickFormat(output, isTTY)
  const text = fmt === 'plain'
    ? renderPlain(errors)
    : fmt === 'terminal'
      ? renderTerminal(errors)
      : renderMarkdown(errors)

  if (output) {
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, text)
  }
  else {
    process.stdout.write(`${text}\n`)
  }
}

export async function run(args: CliArgs): Promise<number> {
  const config = await loadConfig(args.config, args.config === DEFAULT_CONFIG)
  const log = await loadLog(args.log)
  const errors = findErrors(log, config)
  await writeOutput(errors, args.output)
  return errors.length > 0 ? 1 : 0
}
