/**
 * Minimal in-memory stand-in for the `vscode` module.
 *
 * The real module only exists inside the extension host, so tests alias this
 * file in its place (see vitest.config.ts). It records the calls the tests care
 * about — registered commands, context keys, created views — and no-ops the
 * rest.
 */

/** A created file watcher, with its callbacks exposed so tests can fire them. */
export interface StubWatcher {
  pattern   : string
  change    : Array<() => void>
  create    : Array<() => void>
  delete    : Array<() => void>
  fireChange: () => void
}

export interface Recorder {
  commands   : string[]
  contextKeys: Map<string, unknown>
  treeViews  : string[]
  outputLines: string[]
  watchers   : StubWatcher[]
  disposed   : number
}

export const recorder: Recorder = {
  commands   : [],
  contextKeys: new Map(),
  treeViews  : [],
  outputLines: [],
  watchers   : [],
  disposed   : 0,
}

export function resetRecorder(): void {
  recorder.commands = []
  recorder.contextKeys = new Map()
  recorder.treeViews = []
  recorder.outputLines = []
  recorder.watchers = []
  recorder.disposed = 0
}

/** Workspace folders the stub reports; tests set this before activating. */
export const state = {
  workspaceFolders: undefined as Array<{ uri: { fsPath: string } }> | undefined,
  settings        : new Map<string, unknown>(),
}

export class Disposable {
  constructor(private readonly onDispose: () => void = () => {}) {}
  dispose(): void {
    recorder.disposed++
    this.onDispose()
  }
}

export class Uri {
  private constructor(public readonly fsPath: string, public readonly scheme = 'file') {}
  static file(p: string): Uri {
    return new Uri(p)
  }

  static parse(value: string): Uri {
    return new Uri(value.replace(/^file:\/\//, ''))
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`
  }
}

export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number
  ) {}
}

export enum DiagnosticSeverity {
  Error,
  Warning,
  Information,
  Hint
}

export class Diagnostic {
  source?: string
  code?  : string | number
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error
  ) {}
}

export class RelativePattern {
  constructor(public base: unknown, public pattern: string) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export enum TreeItemCollapsibleState {
  None,
  Collapsed,
  Expanded
}

export class TreeItem {
  iconPath?    : unknown
  contextValue?: string
  tooltip?     : string
  resourceUri? : Uri
  command?     : unknown
  constructor(public label: string, public collapsibleState?: TreeItemCollapsibleState) {}
}

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = []
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.push(listener)
    return new Disposable()
  }

  fire(value?: T): void {
    for (const l of this.listeners) l(value as T)
  }

  dispose(): void {}
}

function makeWatcher(pattern: unknown) {
  const entry: StubWatcher = {
    pattern   : pattern instanceof RelativePattern ? pattern.pattern : String(pattern),
    change    : [],
    create    : [],
    delete    : [],
    fireChange: () => {
      for (const cb of entry.change) cb()
    },
  }
  recorder.watchers.push(entry)
  const on = (list: Array<() => void>) => (cb: () => void) => {
    list.push(cb)
    return new Disposable()
  }
  return {
    onDidChange: on(entry.change),
    onDidCreate: on(entry.create),
    onDidDelete: on(entry.delete),
    dispose    : () => {},
  }
}

export const window = {
  createOutputChannel: (name: string, _opts?: unknown) => ({
    name,
    debug  : (m: string) => recorder.outputLines.push(m),
    info   : (m: string) => recorder.outputLines.push(m),
    warn   : (m: string) => recorder.outputLines.push(m),
    error  : (m: string) => recorder.outputLines.push(m),
    show   : () => {},
    dispose: () => {},
  }),
  createTreeView: (id: string, _opts: unknown) => {
    recorder.treeViews.push(id)
    return { dispose: () => {} }
  },
  showErrorMessage      : async () => undefined,
  showInformationMessage: async () => undefined,
}

export const workspace = {
  get workspaceFolders() {
    return state.workspaceFolders
  },
  getConfiguration: (_section: string) => ({
    get: <T>(key: string): T | undefined => state.settings.get(key) as T | undefined,
  }),
  onDidChangeConfiguration: () => new Disposable(),
  onDidSaveTextDocument   : () => new Disposable(),
  createFileSystemWatcher : (pattern: unknown) => makeWatcher(pattern),
  asRelativePath          : (p: unknown) => String(p),
}

export const commands = {
  registerCommand: (id: string, _cb: unknown) => {
    recorder.commands.push(id)
    return new Disposable()
  },
  executeCommand: async (id: string, ...args: unknown[]) => {
    if (id === 'setContext') recorder.contextKeys.set(String(args[0]), args[1])
    return undefined
  },
}

export const languages = {
  createDiagnosticCollection: (name: string) => ({
    name,
    set    : () => {},
    delete : () => {},
    clear  : () => {},
    dispose: () => {},
  }),
}

export const extensions = {
  getExtension: () => undefined,
}
