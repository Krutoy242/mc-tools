import type { Logger } from '../../core/logger.js'
import type { API, GitExtension, Repository } from './git-api.js'
import * as path from 'pathe'
import * as vscode from 'vscode'

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

export class GitStaging {
  private repoPromise?: Promise<Repository | null>

  constructor(
    private logger: Logger,
    private root: string
  ) {}

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
    for (const change of repo.state.workingTreeChanges) {
      result.push({ path: toRel(this.root, change.uri.fsPath), status: STATUS_MAP[change.status] ?? '  ' })
    }
    for (const change of repo.state.indexChanges) {
      result.push({ path: toRel(this.root, change.uri.fsPath), status: STATUS_MAP[change.status] ?? '  ' })
    }
    for (const change of repo.state.untrackedChanges) {
      result.push({ path: toRel(this.root, change.uri.fsPath), status: STATUS_MAP[change.status] ?? '  ' })
    }
    return result
  }

  async add(paths: string[]): Promise<void> {
    const repo = await this.ensureRepo()
    if (!repo || !paths.length) return
    await repo.add(paths.map(p => toRel(this.root, p)))
  }

  async addAll(): Promise<void> {
    const repo = await this.ensureRepo()
    if (!repo) return
    const all = [
      ...repo.state.workingTreeChanges,
      ...repo.state.indexChanges,
      ...repo.state.untrackedChanges,
    ].map(c => toRel(this.root, c.uri.fsPath))
    if (all.length) await repo.add(all)
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
