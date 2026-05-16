import type { Logger } from './core/logger.js'
import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'

export interface Chunk {
  text       : string
  startLine  : number
  isTruncated: boolean
}

export type ChunkHandler = (chunk: Chunk) => void | Promise<void>

export class LogWatcher {
  private watcher?      : vscode.FileSystemWatcher
  private disposed = false
  private lastSize = 0
  private debouncedScan?: () => Promise<void>

  constructor(
    private options: { path: string, debounceMs?: number },
    private logger: Logger,
    private handler: ChunkHandler
  ) {}

  async start(): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) throw new Error('No workspace folder open')

    const fullPath = path.join(root, this.options.path)
    this.logger.info(`Watcher starting on ${this.options.path}`)

    const pattern = new vscode.RelativePattern(root, this.options.path)
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern)

    this.debouncedScan = debounce(
      async () => this.scan(fullPath),
      this.options.debounceMs ?? 300,
      { trailing: true }
    )

    this.watcher.onDidChange(async () => this.debouncedScan?.())
    this.watcher.onDidCreate(async () => this.debouncedScan?.())
    this.watcher.onDidDelete(() => {
      this.logger.warn(`File deleted: ${this.options.path}`)
      this.lastSize = 0
    })

    const stat = await fs.stat(fullPath).catch(() => null)
    if (stat) this.lastSize = stat.size
  }

  private async scan(fullPath: string): Promise<void> {
    if (this.disposed) return
    try {
      const stat = await fs.stat(fullPath)
      const isTruncated = stat.size < this.lastSize

      if (isTruncated) {
        this.logger.warn('File truncated, resetting state')
        this.lastSize = 0
      }

      if (stat.size <= this.lastSize && !isTruncated) return

      const text = await readRange(fullPath, isTruncated ? 0 : this.lastSize, stat.size)
      const startLine = isTruncated
        ? 0
        : await countLinesInRange(fullPath, 0, this.lastSize)

      this.lastSize = stat.size
      await this.handler({ text, startLine, isTruncated })
    }
    catch (err) {
      this.logger.error(`Scan failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  dispose(): void {
    this.disposed = true
    this.watcher?.dispose()
  }
}

async function readRange(filePath: string, start: number, end: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = createReadStream(filePath, { start, end: end - 1 })
    stream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

async function countLinesInRange(filePath: string, start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0
    const stream = createReadStream(filePath, { start, end: end - 1 })
    stream.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk)) return
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0x0A) count++
      }
    })
    stream.on('error', reject)
    stream.on('end', () => resolve(count))
  })
}
