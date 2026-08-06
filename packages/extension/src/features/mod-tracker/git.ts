import type { Logger } from '../../core/logger.js'
import type { API, GitExtension, Repository } from './git-api.js'
import * as fs from 'node:fs/promises'
import * as path from 'pathe'
import * as vscode from 'vscode'
import { isInsideSubmodule, parseSubmodulePaths } from '../../util/gitmodules.js'

const STATUS_MAP: Record<number, string> = {
  0 : 'M ',
  1 : 'A ',
  2 : 'D ',
  3 : 'R ',
  4 : 'C ',
  5 : ' M',
  6 : ' D',
  7 : '??',
  8 : '!!',
  9 : ' A',
  10: ' R',
  11: ' T',
}

async function getGitAPI(): Promise<API | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
  if (!extension) return undefined
  const gitExtension = extension.isActive ? extension.exports : await extension.activate()
  const api = gitExtension.getAPI(1)

  if (api.state === 'uninitialized') {
    await new Promise<void>((resolve) => {
      const sub = api.onDidChangeState((s) => {
        if (s === 'initialized') {
          sub.dispose()
          resolve()
        }
      })
    })
  }

  return api
}

function findRepo(api: API, root: string): Repository | undefined {
  const byUri = api.getRepository(vscode.Uri.file(root))
  if (byUri) return byUri

  const normalizedRoot = root.replace(/\\/g, '/')
  for (const repo of api.repositories) {
    const repoPath = repo.rootUri.fsPath.replace(/\\/g, '/')
    if (repoPath === normalizedRoot || normalizedRoot.startsWith(`${repoPath}/`)) {
      return repo
    }
  }

  return undefined
}

function toRel(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

export async function readSubmodulePaths(root: string): Promise<string[]> {
  const text = await fs.readFile(path.join(root, '.gitmodules'), 'utf-8').catch(() => null)
  return text ? parseSubmodulePaths(text) : []
}

export class GitStaging {
  private repoPromise?: Promise<Repository | null>
  private submodules  : string[] = []

  constructor(
    private logger: Logger,
    private root: string
  ) {}

  async loadSubmodules(): Promise<void> {
    this.submodules = await readSubmodulePaths(this.root)
    if (this.submodules.length) {
      this.logger.info(`Submodules excluded from staging: ${this.submodules.join(', ')}`)
    }
  }

  /** True when `rel` is a submodule root or lives inside one. */
  isSubmodulePath(rel: string): boolean {
    return isInsideSubmodule(rel, this.submodules)
  }

  private async ensureRepo(): Promise<Repository | null> {
    if (!this.repoPromise) {
      this.repoPromise = this.resolveRepo()
    }
    return this.repoPromise
  }

  private async resolveRepo(): Promise<Repository | null> {
    const api = await getGitAPI()
    if (!api) {
      this.logger.warn('VS Code Git extension not available')
      return null
    }

    const found = findRepo(api, this.root)
    if (!found) {
      this.logger.warn(`No Git repository found for workspace: ${this.root}`)
      return null
    }

    this.logger.info(`Git repository resolved: ${found.rootUri.fsPath}`)
    return found
  }

  async status(): Promise<{ path: string, status: string }[]> {
    const repo = await this.ensureRepo()
    if (!repo) return []

    const result: { path: string, status: string }[] = []
    const groups = [repo.state.workingTreeChanges, repo.state.indexChanges, repo.state.untrackedChanges]
    for (const group of groups) {
      for (const change of group) {
        const rel = toRel(this.root, change.uri.fsPath)
        if (this.isSubmodulePath(rel)) continue
        result.push({ path: rel, status: STATUS_MAP[change.status] ?? '  ' })
      }
    }
    return result
  }

  async add(paths: string[]): Promise<void> {
    const repo = await this.ensureRepo()
    if (!repo) return

    const rels = paths.map(p => toRel(this.root, p))
    const skipped = rels.filter(rel => this.isSubmodulePath(rel))
    const staged = rels.filter(rel => !this.isSubmodulePath(rel))

    if (skipped.length) {
      this.logger.warn(`Skipped ${skipped.length} submodule path(s): ${skipped.join(', ')}`)
    }
    if (staged.length) await repo.add(staged)
  }

  async addAll(): Promise<void> {
    const repo = await this.ensureRepo()
    if (!repo) return
    const all = [
      ...repo.state.workingTreeChanges,
      ...repo.state.indexChanges,
      ...repo.state.untrackedChanges,
    ]
      .map(c => toRel(this.root, c.uri.fsPath))
      .filter(rel => !this.isSubmodulePath(rel))
    if (all.length) await repo.add(all)
  }

  /**
   * Commit HEAD points at, or null when unavailable.
   *
   * Reading it is free — the git extension keeps it in memory — which makes it
   * the cheap way to tell whether a blob at HEAD is worth re-reading.
   */
  async headCommit(): Promise<string | null> {
    const repo = await this.ensureRepo()
    return repo?.state.HEAD?.commit ?? null
  }

  async showHead(filePath: string): Promise<string | null> {
    const repo = await this.ensureRepo()
    if (!repo) return null
    try {
      return await repo.show('HEAD', toRel(this.root, filePath))
    }
    catch {
      return null
    }
  }
}
