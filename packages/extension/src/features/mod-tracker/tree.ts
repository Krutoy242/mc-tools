import type { ModChange } from './detector.js'
import * as vscode from 'vscode'

export type ModChangeNode = ModItem | FileItem | GlobalItem

export class ModItem {
  readonly contextValue = 'mod'
  constructor(
    public readonly change: ModChange,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {}
}

export class FileItem {
  readonly contextValue = 'file'
  constructor(
    public readonly uri: vscode.Uri,
    public readonly parent?: ModItem
  ) {}
}

export class GlobalItem {
  readonly contextValue = 'global'
  constructor(
    public readonly label: string,
    public readonly uris: vscode.Uri[]
  ) {}
}

function makeModTreeItem(item: ModItem): vscode.TreeItem {
  const c = item.change
  const oldV = c.fileID.old ?? '?'
  const newV = c.fileID.new ?? '?'
  const label = c.type === 'updated'
    ? `${c.modName} ${oldV} → ${newV} (${c.files.length} files)`
    : `${c.modName} (${c.files.length} files)`
  const treeItem = new vscode.TreeItem(label, item.collapsibleState)
  treeItem.iconPath = new vscode.ThemeIcon(
    c.type === 'updated' ? 'debug-breakpoint-log' : c.type === 'added' ? 'debug-breakpoint-log-unverified' : 'remove'
  )
  treeItem.contextValue = 'mod'
  treeItem.tooltip = `${c.modName}\nJar: ${c.jarFileName}\nType: ${c.type}`
  return treeItem
}

function makeFileTreeItem(item: FileItem): vscode.TreeItem {
  const rel = vscode.workspace.asRelativePath(item.uri)
  const treeItem = new vscode.TreeItem(rel, vscode.TreeItemCollapsibleState.None)
  treeItem.resourceUri = item.uri
  treeItem.command = { command: 'vscode.open', title: 'Open', arguments: [item.uri] }
  return treeItem
}

function makeGlobalTreeItem(item: GlobalItem): vscode.TreeItem {
  const treeItem = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.Collapsed)
  treeItem.iconPath = new vscode.ThemeIcon('gear')
  treeItem.contextValue = 'global'
  return treeItem
}

export class ModChangesProvider implements vscode.TreeDataProvider<ModChangeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ModChangeNode | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private updated: ModItem[] = []
  private added  : ModItem[] = []
  private removed: ModItem[] = []
  private globals: GlobalItem[] = []

  refresh(changes: ModChange[], globalUris: vscode.Uri[]): void {
    this.updated = changes
      .filter(c => c.type === 'updated')
      .map(c => new ModItem(c, vscode.TreeItemCollapsibleState.Collapsed))
    this.added = changes
      .filter(c => c.type === 'added')
      .map(c => new ModItem(c, vscode.TreeItemCollapsibleState.Collapsed))
    this.removed = changes
      .filter(c => c.type === 'removed')
      .map(c => new ModItem(c, vscode.TreeItemCollapsibleState.Collapsed))
    this.globals = globalUris.length
      ? [new GlobalItem('Global Changes', globalUris)]
      : []
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: ModChangeNode): vscode.TreeItem {
    if (element instanceof ModItem) return makeModTreeItem(element)
    if (element instanceof FileItem) return makeFileTreeItem(element)
    if (element instanceof GlobalItem) return makeGlobalTreeItem(element)
    return new vscode.TreeItem('Unknown')
  }

  getChildren(element?: ModChangeNode): ModChangeNode[] {
    if (!element) {
      return [
        ...this.updated,
        ...this.added,
        ...this.removed,
        ...this.globals,
      ]
    }
    if (element instanceof ModItem) {
      return element.change.files.map(f => new FileItem(f, element))
    }
    if (element instanceof GlobalItem) {
      return element.uris.map(u => new FileItem(u))
    }
    return []
  }

  getParent(_element: ModChangeNode): vscode.ProviderResult<ModChangeNode> {
    return undefined
  }
}
