import type { CraftTweakerParser } from './base.js'
import * as fs from 'node:fs/promises'
import * as path from 'pathe'
import * as vscode from 'vscode'

export interface MixinEntry {
  readonly path   : string
  readonly content: string
}

function formatJavaSig(sig: string): string {
  const types: string[] = []
  const re = /(\[*)L([^;]+);/g
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(sig)) !== null) {
    const isArray = m[1].length > 0
    const className = m[2].split('/').pop() ?? m[2]
    types.push(isArray ? `${className}[]` : className)
  }
  return types.join(', ')
}

export async function buildMixinIndex(workspaceRoot: string): Promise<Map<string, MixinEntry>> {
  const index = new Map<string, MixinEntry>()
  const searchDirs = [path.join(workspaceRoot, 'scripts/mixin'), path.join(workspaceRoot, 'scripts')]

  for (const dir of searchDirs) {
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.zs')) continue
        const fullPath = path.join(entry.parentPath, entry.name)
        try {
          const content = await fs.readFile(fullPath, 'utf-8')
          const classMatch = content.match(/zenClass\s+(\w+)/)
          if (classMatch) {
            index.set(classMatch[1], { path: fullPath, content })
          }
        }
        catch {
          // ignore unreadable files
        }
      }
    }
    catch {
      // ignore missing directories
    }
  }

  return index
}

export function findMixinLine(content: string, className: string, methodName: string): number | undefined {
  const lines = content.split('\n')
  let classLine = -1
  let funcLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (classLine === -1 && new RegExp(`zenClass\\s+${className}`).test(lines[i])) {
      classLine = i
    }
    if (classLine !== -1 && new RegExp(`function\\s+${methodName}\\s*\\(`).test(lines[i])) {
      if (/zenClass\s+/.test(lines[i]) && i > classLine) {
        classLine = -1
        continue
      }
      funcLine = i
      break
    }
  }
  if (funcLine === -1) return undefined
  for (let i = funcLine - 1; i >= 0; i--) {
    if (/\/\/\s*#mixin\s+Inject/.test(lines[i])) {
      return i
    }
    if (i <= classLine) break
  }
  return undefined
}

export function createMixinParser(mixinIndex: Map<string, MixinEntry>): CraftTweakerParser {
  return {
    name: 'mixin',
    tryParse(lines, startIndex, _workspaceRoot) {
      const line = lines[startIndex]
      if (startIndex + 1 >= lines.length) return undefined
      if (!/\[FATAL\].*Error occurred when applying mixin/.test(line)) return undefined

      const classMatch = line.match(/Error occurred when applying mixin (\w+)/)
      if (!classMatch) return undefined
      const mixinClassName = classMatch[1]

      const entry = mixinIndex.get(mixinClassName)
      if (!entry) return undefined

      const nextLine = lines[startIndex + 1]
      const methodMatch = nextLine.match(/->@Inject::(\w+)/) ?? nextLine.match(/annotation on (\w+)/)
      if (!methodMatch) return undefined
      const methodName = methodMatch[1]

      const targetLine = findMixinLine(entry.content, mixinClassName, methodName)
      if (targetLine === undefined) return undefined

      let message = nextLine.trim()
      const descMatch = message.match(/->@Inject::(\w+)\(.*\)V!\s*Expected \((.*?)\)V but found \((.*?)\)V/)
      if (descMatch) {
        const funcName = descMatch[1]
        const expected = formatJavaSig(descMatch[2])
        const found = formatJavaSig(descMatch[3])
        message = `Expected ${funcName}(${expected}) but found ${funcName}(${found})`
      }
      else {
        const colonMatch = message.match(/:(.*)/)
        if (colonMatch) message = colonMatch[1].trim()
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const refmapMatch = message.match(/(.*?)\s*\. Using refmap/)
        if (refmapMatch) message = refmapMatch[1].trim()
      }

      return {
        result: {
          severity  : 'error',
          message,
          targetUri : vscode.Uri.file(entry.path),
          targetLine,
          originLine: startIndex,
        },
        linesConsumed: 1,
      }
    },
  }
}
