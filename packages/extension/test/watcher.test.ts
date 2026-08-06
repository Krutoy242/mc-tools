import type { Chunk } from '../src/watcher.js'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LogWatcher } from '../src/watcher.js'
import { recorder, resetRecorder, state } from './stubs/vscode.js'

const silentLogger = {
  debug: () => {},
  info : () => {},
  warn : () => {},
  error: () => {},
  time : () => () => {},
}

/** `n` numbered lines, so a chunk's content pins down which part was read. */
function lines(from: number, to: number): string {
  return `${Array.from({ length: to - from }, (_, i) => `line ${from + i}`).join('\n')}\n`
}

describe('logWatcher', () => {
  let dir: string
  let file: string
  let chunks: Chunk[]

  beforeEach(async () => {
    resetRecorder()
    dir = await mkdtemp(join(tmpdir(), 'mctools-watcher-'))
    file = join(dir, 'debug.log')
    state.workspaceFolders = [{ uri: { fsPath: dir } }]
    chunks = []
  })

  afterEach(async () => {
    state.workspaceFolders = undefined
    await rm(dir, { recursive: true, force: true })
  })

  const collect = (c: Chunk) => {
    chunks.push(c)
  }

  it('parses the file from its start, not its tail', async () => {
    // Minecraft writes mod-loading errors first and error-filter configs cut the
    // log where the world loads, so reading the tail of a long session finds
    // nothing. This is the regression that kept the Problems panel empty.
    await writeFile(file, lines(0, 2000), 'utf-8')

    const watcher = new LogWatcher({ path: 'debug.log', maxInitialReadBytes: 0 }, silentLogger, collect)
    await watcher.start()
    watcher.dispose()

    expect(chunks).toHaveLength(1)
    expect(chunks[0].startLine).toBe(0)
    expect(chunks[0].text.startsWith('line 0\n')).toBe(true)
    expect(chunks[0].text).toContain('line 1999')
  })

  it('honours the initial-read cap by keeping the head and dropping the rest', async () => {
    await writeFile(file, lines(0, 2000), 'utf-8')

    const watcher = new LogWatcher({ path: 'debug.log', maxInitialReadBytes: 200 }, silentLogger, collect)
    await watcher.start()
    watcher.dispose()

    expect(chunks[0].startLine).toBe(0)
    expect(chunks[0].text.startsWith('line 0\n')).toBe(true)
    expect(chunks[0].text).not.toContain('line 1999')
  })

  it('reports absolute line numbers for text appended after the cap', async () => {
    // The skipped middle is newline-counted rather than parsed, so a later
    // chunk still knows where it sits in the file.
    await writeFile(file, lines(0, 500), 'utf-8')

    const watcher = new LogWatcher(
      { path: 'debug.log', debounceMs: 0, maxInitialReadBytes: 100 },
      silentLogger,
      collect
    )
    await watcher.start()

    await appendFile(file, lines(500, 505), 'utf-8')
    recorder.watchers[0].fireChange()
    await new Promise(resolve => setTimeout(resolve, 60))
    watcher.dispose()

    expect(chunks).toHaveLength(2)
    expect(chunks[1].startLine).toBe(500)
    expect(chunks[1].text).toBe(lines(500, 505))
    expect(chunks[1].isTruncated).toBe(false)
  })

  it('re-reads from scratch when the log is rotated', async () => {
    await writeFile(file, lines(0, 100), 'utf-8')

    const watcher = new LogWatcher({ path: 'debug.log', debounceMs: 0 }, silentLogger, collect)
    await watcher.start()

    await writeFile(file, lines(0, 3), 'utf-8')
    recorder.watchers[0].fireChange()
    await new Promise(resolve => setTimeout(resolve, 60))
    watcher.dispose()

    expect(chunks[1].isTruncated).toBe(true)
    expect(chunks[1].startLine).toBe(0)
    expect(chunks[1].text).toBe(lines(0, 3))
  })

  it('spots a rotation that left a bigger file behind', async () => {
    // Minecraft rolls debug.log away and opens a new one, which can outgrow the
    // previous run before the first scan lands. Reported as diagnostics that
    // survived a restart and pointed at lines from the old session.
    await writeFile(file, lines(0, 100), 'utf-8')

    const watcher = new LogWatcher({ path: 'debug.log', debounceMs: 0 }, silentLogger, collect)
    await watcher.start()

    await rm(file)
    await writeFile(file, lines(0, 500), 'utf-8')
    recorder.watchers[0].fireChange()
    await new Promise(resolve => setTimeout(resolve, 60))
    watcher.dispose()

    expect(chunks[1].isTruncated).toBe(true)
    expect(chunks[1].startLine).toBe(0)
    expect(chunks[1].text).toBe(lines(0, 500))
  })

  it('carries the reset over an empty file left by a delete event', async () => {
    // log4j creates the new log before writing to it, so the scan that follows
    // the delete finds nothing to hand over. The reset has to wait for the first
    // chunk that does carry text instead of being dropped.
    await writeFile(file, lines(0, 100), 'utf-8')

    const watcher = new LogWatcher({ path: 'debug.log', debounceMs: 0 }, silentLogger, collect)
    await watcher.start()

    await rm(file)
    for (const cb of recorder.watchers[0].delete) cb()
    await writeFile(file, '', 'utf-8')
    recorder.watchers[0].fireChange()
    await new Promise(resolve => setTimeout(resolve, 60))

    expect(chunks).toHaveLength(1)

    await writeFile(file, lines(0, 4), 'utf-8')
    recorder.watchers[0].fireChange()
    await new Promise(resolve => setTimeout(resolve, 60))
    watcher.dispose()

    expect(chunks[1].isTruncated).toBe(true)
    expect(chunks[1].startLine).toBe(0)
    expect(chunks[1].text).toBe(lines(0, 4))
  })
})
