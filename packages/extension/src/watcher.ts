import type { Logger } from './core/logger.js'
import * as fs from 'node:fs/promises'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { errorMessage } from './util/helpers.js'
import { countBufferNewlines, countNewlines, nextLineStart, readRange } from './util/logtail.js'

export interface Chunk {
  text       : string
  startLine  : number
  isTruncated: boolean
}

export type ChunkHandler = (chunk: Chunk) => void | Promise<void>

export interface LogWatcherOptions {
  /** Path to the log, relative to the workspace root. */
  path                : string
  debounceMs?         : number
  /**
   * Cap for the first read, counted from the start of the file. Anything past
   * it is skipped but still newline-counted, so later chunks keep reporting
   * absolute line numbers.
   */
  maxInitialReadBytes?: number
}

/**
 * Tails a log file and hands newly appended text to a handler.
 *
 * Line numbers are tracked incrementally: every chunk's newlines are counted as
 * it goes by, so the file is read end-to-end exactly once (at startup) no
 * matter how many times it grows afterwards.
 */
export class LogWatcher {
  private watcher?      : vscode.FileSystemWatcher
  private disposed = false
  private lastSize = 0
  private lastLine = 0
  private scanning = false
  private rescanQueued = false
  private debouncedScan?: () => Promise<void>

  constructor(
    private options: LogWatcherOptions,
    private logger: Logger,
    private handler: ChunkHandler
  ) {}

  async start(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) throw new Error('No workspace folder open')

    const fullPath = path.join(root, this.options.path)
    this.logger.info(`Watcher starting on ${this.options.path}`)

    await this.readInitial(fullPath)

    const pattern = new vscode.RelativePattern(root, this.options.path)
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern)

    this.debouncedScan = debounce(
      async () => this.scan(fullPath),
      this.options.debounceMs ?? 300,
      { trailing: true }
    )

    const trigger = () => {
      this.debouncedScan?.().catch(err => this.logger.error(`Scan failed: ${errorMessage(err)}`))
    }
    this.watcher.onDidChange(trigger)
    this.watcher.onDidCreate(trigger)
    this.watcher.onDidDelete(() => {
      this.logger.warn(`File deleted: ${this.options.path}`)
      this.lastSize = 0
      this.lastLine = 0
    })
  }

  /**
   * Parses the existing file from its start, seeding the size and line counters.
   *
   * Reading from the beginning rather than the tail is deliberate: Minecraft
   * writes mod-loading errors first, and error-filter configs routinely cut the
   * log where the world finishes loading (`boundaries.to`), so a tail read of a
   * long session finds nothing at all.
   */
  private async readInitial(fullPath: string): Promise<void> {
    const stat = await fs.stat(fullPath).catch(() => null)
    if (!stat) return

    const cap = this.options.maxInitialReadBytes ?? 0
    let end = cap > 0 ? Math.min(stat.size, cap) : stat.size
    // Stop on a line boundary so the last parsed line is not a fragment.
    if (end < stat.size) end = await nextLineStart(fullPath, end, stat.size)

    const buf = await readRange(fullPath, 0, end)
    this.lastSize = end
    this.lastLine = countBufferNewlines(buf)

    await this.handler({ text: buf.toString('utf-8'), startLine: 0, isTruncated: false })

    if (end < stat.size) {
      const skipped = stat.size - end
      const timer = this.logger.time(`Skip ${(skipped / 1024 / 1024).toFixed(2)} MB past the initial-read cap`)
      this.lastLine += await countNewlines(fullPath, end, stat.size)
      this.lastSize = stat.size
      timer()
      this.logger.warn(
        `${this.options.path} exceeds the initial-read cap — ${(skipped / 1024 / 1024).toFixed(2)} MB `
        + 'between the cap and the end of the file was not parsed.'
      )
    }
  }

  private async scan(fullPath: string): Promise<void> {
    if (this.disposed) return
    if (this.scanning) {
      this.rescanQueued = true
      return
    }
    this.scanning = true
    try {
      do {
        this.rescanQueued = false
        await this.scanOnce(fullPath)
      } while (this.rescanQueued && !this.disposed)
    }
    finally {
      this.scanning = false
    }
  }

  private async scanOnce(fullPath: string): Promise<void> {
    try {
      const stat = await fs.stat(fullPath)

      // Minecraft rotates debug.log on restart; a shrunk file means a new run.
      const isTruncated = stat.size < this.lastSize
      if (isTruncated) {
        this.logger.warn('File truncated, resetting state')
        this.lastSize = 0
        this.lastLine = 0
      }

      if (stat.size <= this.lastSize) return

      const startLine = this.lastLine
      const buf = await readRange(fullPath, this.lastSize, stat.size)

      this.lastSize = stat.size
      this.lastLine += countBufferNewlines(buf)

      await this.handler({ text: buf.toString('utf-8'), startLine, isTruncated })
    }
    catch (err) {
      this.logger.error(`Scan failed: ${errorMessage(err)}`)
    }
  }

  dispose(): void {
    this.disposed = true
    this.watcher?.dispose()
  }
}
