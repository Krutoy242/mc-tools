import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import type { CraftTweakerParser, ParsedError } from './parsers/base.js'
import * as fs from 'node:fs/promises'
import { hash } from 'ohash'
import * as path from 'pathe'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { genericParser } from './parsers/generic.js'
import { buildMixinIndex, createMixinParser } from './parsers/mixin.js'
import { scriptParser } from './parsers/script.js'
import { CraftTweakerDiagnosticsProvider } from './provider.js'

class CraftTweakerScanner {
  private lastHash = ''
  private lastContent = ''
  private parsers: CraftTweakerParser[]

  constructor(
    private fullPath: string,
    private workspaceRoot: string,
    mixinIndex: Map<string, import('./parsers/mixin.js').MixinEntry>,
    private provider: CraftTweakerDiagnosticsProvider,
    private logger: Logger
  ) {
    this.parsers = [createMixinParser(mixinIndex), scriptParser, genericParser]
  }

  async scan(): Promise<void> {
    try {
      const stat = await fs.stat(this.fullPath)
      const text = await fs.readFile(this.fullPath, 'utf-8')
      const textHash = hash(text)

      if (textHash === this.lastHash && text === this.lastContent) {
        this.logger.info('📖 crafttweaker.log unchanged, reusing cached diagnostics')
        return
      }

      this.lastHash = textHash
      this.lastContent = text
      const lines = text.split('\n')
      this.logger.info(`📖 crafttweaker.log: ${(stat.size / 1024 / 1024).toFixed(2)} MB, ${lines.length.toLocaleString()} lines`)

      const errors: ParsedError[] = []
      const parserHits = new Map<string, number>()
      let i = 0
      while (i < lines.length) {
        let consumed = 0
        let parsed: ParsedError | undefined
        for (const parser of this.parsers) {
          const res = parser.tryParse(lines, i, this.workspaceRoot)
          if (res) {
            parsed = res.result
            consumed = res.linesConsumed
            parserHits.set(parser.name, (parserHits.get(parser.name) ?? 0) + 1)
            break
          }
        }
        if (parsed) errors.push(parsed)
        i += consumed + 1
      }

      const byParser = Array.from(parserHits.entries()).map(([n, c]) => `${n}: ${c}`).join(', ')
      this.logger.info(`🔍 Found ${errors.length} CraftTweaker errors${byParser ? ` (${byParser})` : ''}`)
      this.provider.update(errors)
    }
    catch (err) {
      this.logger.error(`❌ CraftTweaker scan failed: ${errorMessage(err)}`)
    }
  }

  updateMixinIndex(mixinIndex: Map<string, import('./parsers/mixin.js').MixinEntry>): void {
    this.parsers[0] = createMixinParser(mixinIndex)
  }
}

export async function activateCraftTweakerLog(
  _context: vscode.ExtensionContext,
  diagnostics: DiagnosticsManager,
  logger: Logger,
  config: { path: string, fileExtensions: string[] }
): Promise<() => void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) {
    logger.warn('No workspace folder, crafttweaker-log monitor disabled')
    return () => {}
  }

  const fullPath = path.join(root, config.path)
  try {
    await fs.access(fullPath)
  }
  catch {
    logger.warn(`crafttweaker.log not found at ${config.path}`)
    return () => {}
  }

  let mixinIndex = await buildMixinIndex(root)
  const provider = new CraftTweakerDiagnosticsProvider(diagnostics, logger, root, config.path)
  const scanner = new CraftTweakerScanner(fullPath, root, mixinIndex, provider, logger)

  await scanner.scan()

  const pattern = new vscode.RelativePattern(root, config.path)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  watcher.onDidChange(async () => scanner.scan())
  watcher.onDidCreate(async () => scanner.scan())

  const saveSub = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.languageId === 'zenscript' || config.fileExtensions.some(ext => doc.uri.fsPath.endsWith(ext))) {
      void (async () => {
        mixinIndex = await buildMixinIndex(root)
        scanner.updateMixinIndex(mixinIndex)
        await scanner.scan()
      })()
    }
  })

  logger.info('✅ CraftTweaker-log monitor activated')

  return () => {
    watcher.dispose()
    saveSub.dispose()
    provider.clear()
    logger.info('🛑 CraftTweaker-log monitor deactivated')
  }
}
