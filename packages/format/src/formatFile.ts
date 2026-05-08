/**
 * I/O orchestration: read .zs/.ts files, run conversions, write artefacts.
 *
 * Returns rich result objects so the CLI can keep `src ↔ dst` pairs in sync
 * (the previous implementation lost this correspondence by `.filter(Boolean)`
 * on the result array).
 */

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, parse, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

import { consola } from 'consola'
import { colors } from 'consola/utils'

import { revert, zsToTs } from './index.js'

const formatMs = (ms: number) => colors.gray(` (${ms.toFixed(2)}ms)`)

export interface ConvertedFile {
  /** Original file passed to the function. */
  src : string
  /** Path of the produced `.ts` (forward) or `.zs` (reverse). */
  dst : string
  /** `'forward'` = ZS → TS, `'reverse'` = TS → ZS (no-op write-through). */
  kind: 'forward' | 'reverse'
}

export interface ConversionFailure {
  src  : string
  error: Error
}

export type ConvertOutcome = ConvertedFile | ConversionFailure

export function isFailure(o: ConvertOutcome): o is ConversionFailure {
  return 'error' in o
}

/**
 * Convert a list of files. For each `.zs` we emit a sibling `.ts`; for
 * pre-existing `.ts` we run the reverse pass and rewrite back to `.zs`.
 */
export function convertToTs(fileList: string[], verbose = false): ConvertOutcome[] {
  return fileList.map((filePath): ConvertOutcome => {
    const pathRelative = relative(process.cwd(), filePath)
    process.stdout.write(colors.blueBright(pathRelative))

    const startRead = performance.now()
    process.stdout.write(` ${colors.inverse(colors.gray('read'))}`)
    const fileContent = readFileSync(filePath, 'utf8')
    if (verbose) process.stdout.write(formatMs(performance.now() - startRead))

    const fileParsed = parse(filePath)
    const isForward = fileParsed.ext === '.zs'
    // Forward: foo.zs → foo.zs.ts (the `.zs.ts` suffix lets eslint.config.js
    // target only ZS-derived files). Reverse: foo.zs.ts → foo.zs.
    const newFilePath = isForward
      ? join(fileParsed.dir, `${fileParsed.name}.zs.ts`)
      : join(fileParsed.dir, fileParsed.name.endsWith('.zs') ? fileParsed.name : `${fileParsed.name}.zs`)

    if (!isForward) {
      const startRevert = performance.now()
      process.stdout.write(` ${colors.dim(colors.cyan(colors.inverse('revert')))}`)
      writeFileSync(newFilePath, revert(fileContent))
      if (verbose) process.stdout.write(formatMs(performance.now() - startRevert))
      process.stdout.write(`\n`)
      unlinkSync(filePath)
      return { src: filePath, dst: newFilePath, kind: 'reverse' }
    }

    const startConvert = performance.now()
    process.stdout.write(` ${colors.green(colors.inverse('convert to ts'))}`)
    const result = zsToTs(fileContent)
    if (verbose) process.stdout.write(formatMs(performance.now() - startConvert))

    if (!result.ok) {
      printParseError(filePath, fileContent, result.error)
      return { src: filePath, error: result.error }
    }

    const startSave = performance.now()
    process.stdout.write(` ${colors.blue(colors.inverse('save'))}`)
    writeFileSync(newFilePath, result.ts)
    if (verbose) process.stdout.write(formatMs(performance.now() - startSave))
    process.stdout.write(`\n`)
    return { src: filePath, dst: newFilePath, kind: 'forward' }
  })
}

function printParseError(filePath: string, source: string, e: Error): void {
  const loc = (e as { location?: { start?: { line?: number, column?: number } } })
    .location
    ?.start
  if (!loc?.line || !loc.column) {
    consola.error(`Failed to parse ${colors.blueBright(filePath)}:\n${e.message}`)
    return
  }
  const line = loc.line
  const column = loc.column
  const lineText = source.split('\n')[line - 1] ?? ''
  const errorLine = `\n\n  ${line} | ${lineText}\n`
    + `   ${' '.repeat(String(line).length)}| ${' '.repeat(column - 1)}^`
  consola.error(`Failed to parse ${colors.blueBright(filePath)}:\n${e.message}${errorLine}`)
}
