import type { McToolsConfig } from '../../core/config.js'
import type { DiagnosticsManager } from '../../core/diagnostics.js'
import type { Logger } from '../../core/logger.js'
import type { CraftTweakerParser } from './parsers/base.js'
import * as fs from 'node:fs/promises'
import { hash } from 'ohash'
import * as path from 'pathe'
import { debounce } from 'perfect-debounce'
import * as vscode from 'vscode'
import { errorMessage } from '../../util/helpers.js'
import { genericParser } from './parsers/generic.js'
import { createMixinParser, MixinIndex } from './parsers/mixin.js'
import { scriptParser } from './parsers/script.js'
import { CraftTweakerDiagnosticsProvider } from './provider.js'
import { scanLog } from './scan.js'

class CraftTweakerScanner {
  private lastHash = ''
  private parsers: CraftTweakerParser[]

  constructor(
    private fullPath: string,
    private workspaceRoot: string,
    private mixinIndex: MixinIndex,
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

      // Only the hash is retained between scans; keeping the previous log body
      // would pin megabytes of text in the extension host for nothing.
      if (textHash === this.lastHash) {
        this.logger.debug('📖 crafttweaker.log unchanged, keeping current diagnostics')
        return
      }
      this.lastHash = textHash

      const { errors, lineCount, hits } = scanLog(text, this.workspaceRoot, this.parsers)
      this.logger.info(`📖 crafttweaker.log: ${(stat.size / 1024 / 1024).toFixed(2)} MB, ${lineCount.toLocaleString()} lines`)

      const byParser = Array.from(hits.entries()).map(([n, c]) => `${n}: ${c}`).join(', ')
      this.logger.info(`🔍 Found ${errors.length} CraftTweaker errors${byParser ? ` (${byParser})` : ''}`)
      this.provider.update(errors)
    }
    catch (err) {
      // A log that vanished mid-scan is the delete handler's business.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      this.logger.error(`❌ CraftTweaker scan failed: ${errorMessage(err)}`)
    }
  }

  /** Forces the next {@link scan} to re-parse even if the log is byte-identical. */
  invalidate(): void {
    this.lastHash = ''
    this.parsers[0] = createMixinParser(this.mixinIndex)
  }
}

export async function activateCraftTweakerLog(
  _context: vscode.ExtensionContext,
  diagnostics: DiagnosticsManager,
  logger: Logger,
  config: McToolsConfig['crafttweakerLog']
): Promise<() => void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) {
    logger.warn('No workspace folder, crafttweaker-log monitor disabled')
    return () => {}
  }

  const fullPath = path.join(root, config.path)
  const exists = await fs.access(fullPath).then(() => true, () => false)
  if (!exists) {
    // The log only appears once the game has run once. Bailing out here used to
    // mean no diagnostics for the rest of the session.
    logger.info(`crafttweaker.log not found at ${config.path} — waiting for it`)
  }

  const indexTimer = logger.time('Build mixin index')
  const mixinIndex = await MixinIndex.build(root)
  indexTimer()
  logger.info(`🧩 Mixin index: ${mixinIndex.size} zenClass declarations`)

  const provider = new CraftTweakerDiagnosticsProvider(diagnostics, logger, root, config.path, config.maxDiagnostics)
  const scanner = new CraftTweakerScanner(fullPath, root, mixinIndex, provider, logger)

  if (exists) await scanner.scan()

  const debouncedScan = debounce(async () => scanner.scan(), 300, { trailing: true })
  const rescan = () => {
    debouncedScan().catch(err => logger.error(`❌ CraftTweaker scan failed: ${errorMessage(err)}`))
  }

  const pattern = new vscode.RelativePattern(root, config.path)
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)
  watcher.onDidChange(rescan)
  watcher.onDidCreate(() => {
    // A recreated log is a new game session: whatever the old one reported is
    // gone, and its content hash must not suppress the first scan of the new.
    scanner.invalidate()
    rescan()
  })
  watcher.onDidDelete(() => {
    logger.info('crafttweaker.log deleted — dropping its diagnostics')
    scanner.invalidate()
    provider.clear()
  })

  const scriptsDir = path.join(root, 'scripts')
  const saveSub = vscode.workspace.onDidSaveTextDocument((doc) => {
    const file = path.normalize(doc.uri.fsPath)
    const isZs = doc.languageId === 'zenscript' || config.fileExtensions.some(ext => file.endsWith(ext))
    if (!isZs || !file.startsWith(scriptsDir)) return

    void (async () => {
      // Patch only the saved script instead of re-reading every .zs in the pack.
      await mixinIndex.update(file)
      scanner.invalidate()
      rescan()
    })()
  })

  logger.info('✅ CraftTweaker-log monitor activated')

  return () => {
    watcher.dispose()
    saveSub.dispose()
    provider.clear()
    logger.info('🛑 CraftTweaker-log monitor deactivated')
  }
}
