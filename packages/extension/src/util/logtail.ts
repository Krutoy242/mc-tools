import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'

/**
 * Byte-level helpers for tailing a log file.
 *
 * Everything here works on ranges rather than whole files, so a 50+ MB
 * `debug.log` never has to be materialised as a string.
 */

/** 0x0A never occurs inside a multi-byte UTF-8 sequence, so bytes are safe here. */
export function countBufferNewlines(buf: Buffer): number {
  let count = 0
  let i = -1
  // eslint-disable-next-line no-cond-assign
  while ((i = buf.indexOf(0x0A, i + 1)) !== -1) count++
  return count
}

/** Counts lines in a decoded chunk without allocating an array per line. */
export function countTextLines(text: string): number {
  let count = 1
  let i = -1
  // eslint-disable-next-line no-cond-assign
  while ((i = text.indexOf('\n', i + 1)) !== -1) count++
  return count
}

/** Reads the half-open byte range `[start, end)`. */
export async function readRange(filePath: string, start: number, end: number): Promise<Buffer> {
  if (end <= start) return Buffer.alloc(0)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = createReadStream(filePath, { start, end: end - 1 })
    stream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/** Streams the range without materialising it, so huge prefixes cost no memory. */
export async function countNewlines(filePath: string, start: number, end: number): Promise<number> {
  if (end <= start) return 0
  return new Promise((resolve, reject) => {
    let count = 0
    const stream = createReadStream(filePath, { start, end: end - 1 })
    stream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) count += countBufferNewlines(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(count))
  })
}

/** Byte offset just past the first newline at or after `from`. */
export async function nextLineStart(filePath: string, from: number, end: number): Promise<number> {
  const probe = await readRange(filePath, from, Math.min(end, from + 64 * 1024))
  const nl = probe.indexOf(0x0A)
  return nl === -1 ? from : from + nl + 1
}
