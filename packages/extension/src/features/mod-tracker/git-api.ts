import type { Event, Uri } from 'vscode'

export enum Status {
  INDEX_MODIFIED,
  INDEX_ADDED,
  INDEX_DELETED,
  INDEX_RENAMED,
  INDEX_COPIED,
  MODIFIED,
  DELETED,
  UNTRACKED,
  IGNORED,
  INTENT_TO_ADD,
  INTENT_TO_RENAME,
  TYPE_CHANGED,
  ADDED_BY_US,
  ADDED_BY_THEM,
  DELETED_BY_US,
  DELETED_BY_THEM,
  BOTH_ADDED,
  BOTH_DELETED,
  BOTH_MODIFIED
}

export interface Change {
  readonly uri        : Uri
  readonly originalUri: Uri
  readonly renameUri  : Uri | undefined
  readonly status     : Status
}

export interface RepositoryState {
  readonly HEAD              : { name?: string, commit?: string } | undefined
  readonly mergeChanges      : Change[]
  readonly indexChanges      : Change[]
  readonly workingTreeChanges: Change[]
  readonly untrackedChanges  : Change[]
  readonly onDidChange       : Event<void>
}

export interface Repository {
  readonly rootUri: Uri
  readonly state  : RepositoryState
  show            : (ref: string, path: string) => Promise<string>
  add             : (paths: string[]) => Promise<void>
  status          : () => Promise<void>
}

export interface API {
  readonly state               : 'uninitialized' | 'initialized'
  readonly onDidChangeState    : Event<'uninitialized' | 'initialized'>
  readonly repositories        : Repository[]
  readonly onDidOpenRepository : Event<Repository>
  readonly onDidCloseRepository: Event<Repository>
  getRepository                : (uri: Uri) => Repository | null
  toGitUri                     : (uri: Uri, ref: string) => Uri
}

export interface GitExtension {
  readonly enabled              : boolean
  readonly onDidChangeEnablement: Event<boolean>
  getAPI                        : (version: 1) => API
}
