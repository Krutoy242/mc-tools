import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  countBufferNewlines,
  countNewlines,
  countTextLines,
  nextLineStart,
  readRange,
} from '../src/util/logtail.js'

describe('countBufferNewlines', () => {
  it('counts LF bytes', () => {
    expect(countBufferNewlines(Buffer.from('a\nb\nc'))).toBe(2)
    expect(countBufferNewlines(Buffer.from('no newline'))).toBe(0)
    expect(countBufferNewlines(Buffer.alloc(0))).toBe(0)
  })

  it('is unaffected by multi-byte characters', () => {
    // Cyrillic and emoji bytes must never be mistaken for a line break.
    expect(countBufferNewlines(Buffer.from('привет\n🎉\n'))).toBe(2)
  })
})

describe('countTextLines', () => {
  it('counts lines, not separators', () => {
    expect(countTextLines('a\nb\nc')).toBe(3)
    expect(countTextLines('single')).toBe(1)
  })
})

describe('range readers', () => {
  let dir: string
  let file: string
  const lines = Array.from({ length: 500 }, (_, i) => `line ${i}`)
  const body = `${lines.join('\n')}\n`

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mctools-logtail-'))
    file = join(dir, 'debug.log')
    await writeFile(file, body, 'utf-8')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('readRange returns the half-open range', async () => {
    const buf = await readRange(file, 0, 6)
    expect(buf.toString('utf-8')).toBe('line 0')
  })

  it('readRange yields nothing for an empty range', async () => {
    expect((await readRange(file, 10, 10)).length).toBe(0)
  })

  it('countNewlines matches a full count of the prefix', async () => {
    expect(await countNewlines(file, 0, Buffer.byteLength(body))).toBe(500)
    expect(await countNewlines(file, 0, 0)).toBe(0)
  })

  it('nextLineStart lands just past a newline', async () => {
    const total = Buffer.byteLength(body)
    const start = await nextLineStart(file, 10, total)
    const tail = (await readRange(file, start, total)).toString('utf-8')
    expect(tail.startsWith('line ')).toBe(true)
    expect(tail.split('\n')[0]).toBe('line 2')
  })

  it('incremental counting matches a full recount', async () => {
    // The property the watcher relies on: summing per-chunk newline counts must
    // equal counting the whole file, so line numbers never drift as it grows.
    const total = Buffer.byteLength(body)
    const bounds = [0, 137, 913, 4096, total]
    let incremental = 0
    for (let i = 1; i < bounds.length; i++) {
      incremental += countBufferNewlines(await readRange(file, bounds[i - 1], bounds[i]))
    }
    expect(incremental).toBe(await countNewlines(file, 0, total))
  })
})
