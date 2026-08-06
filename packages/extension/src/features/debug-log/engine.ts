import type { CompiledConfig, FoundError } from '@mctools/errors'
import type { Logger } from '../../core/logger.js'
import { findErrors } from '@mctools/errors'
import { hash } from 'ohash'
import { countTextLines } from '../../util/logtail.js'

export class DebugLogEngine {
  private known = new Set<string>()
  private totalLines = 0
  private totalNovel = 0

  constructor(
    private config: CompiledConfig,
    private logger: Logger
  ) {}

  processChunk(chunk: { text: string, startLine: number, isTruncated: boolean }): FoundError[] {
    const raw = findErrors(chunk.text, this.config)
    const adjusted = raw.map(e => ({ ...e, line: e.line + chunk.startLine }))
    const novel: FoundError[] = []
    for (const e of adjusted) {
      const key = hash(e.text)
      if (!this.known.has(key)) {
        this.known.add(key)
        novel.push(e)
      }
    }

    const lines = countTextLines(chunk.text)
    this.totalLines += lines
    this.totalNovel += novel.length
    this.logger.debug(`Processed ${lines} lines, ${novel.length} novel errors (${this.totalLines} lines / ${this.totalNovel} errors total)`)

    return novel
  }

  reset(): void {
    this.known.clear()
    this.totalLines = 0
    this.totalNovel = 0
  }
}
