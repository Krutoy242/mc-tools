import type { CraftTweakerParser, ParseContext, ScriptFrame } from './base.js'
import * as path from 'pathe'
import * as vscode from 'vscode'
import { severityOf } from './base.js'

/** `at equipment\ModifierGenVRVtZVF.buildSlotPool(equipment\modifierGen.zs:128)` */
const STACK_FRAME = /\bat\s+(\S+?)\(([^()]*?\.zs)(?::(\d+))?\)/
/** Older CraftTweaker wraps the script path instead of naming a generated class. */
const SCRIPT_FRAME = /__script__\(([^()]*?\.zs):(\d+)\)/
/** `_init\purge.zs:297: message` and `Error executing scripts/x.zs:12 > message` */
const INLINE_LOCATION = /((?:[A-Z]:)?[^\s:*?"<>|]+\.zs):(\d+)\s*(?:[:>]\s*)?/
/** `slimeknights.tconstruct.library.modifiers.TinkerGuiException: message` */
const EXCEPTION = /^(?:[a-z_]\w*\.)+([A-Z_]\w*)(?::|$)/

/**
 * CraftTweaker logs script paths relative to `scripts/`, with the odd message
 * spelling the folder out.
 */
function resolveScript(file: string, workspaceRoot: string): string {
  const normalized = file.replaceAll('\\', '/')
  if (path.isAbsolute(normalized)) return normalized
  return normalized.startsWith('scripts/')
    ? path.join(workspaceRoot, normalized)
    : path.join(workspaceRoot, 'scripts', normalized)
}

/**
 * The `.zs` frames of a Java stack trace, innermost first — the first one is
 * the line that actually failed, the rest are the call chain that reached it.
 */
function scriptFrames(body: readonly string[], workspaceRoot: string): ScriptFrame[] {
  const frames: ScriptFrame[] = []
  const seen = new Set<string>()

  for (const raw of body) {
    const line = raw.trim()
    let file: string
    let num: string | undefined
    let label: string

    const script = SCRIPT_FRAME.exec(line)
    if (script) {
      file = script[1]
      num = script[2]
      label = path.basename(file)
    }
    else {
      const frame = STACK_FRAME.exec(line)
      if (!frame) continue
      // `equipment\ModifierGenVRVtZVF.buildSlotPool` — the class carries the
      // random suffix CraftTweaker appends per reload, the method does not.
      label = `${frame[1].slice(frame[1].lastIndexOf('.') + 1)}()`
      file = frame[2]
      num = frame[3]
    }

    // A frame without a line number (the outermost handler) points nowhere
    // useful, so it is not worth a jump target.
    if (!num) continue

    const fsPath = resolveScript(file, workspaceRoot)
    const target = Math.max(0, Number.parseInt(num, 10) - 1)
    const key = `${fsPath}:${target}`
    if (seen.has(key)) continue
    seen.add(key)
    frames.push({ uri: vscode.Uri.file(fsPath), line: target, label })
  }

  return frames
}

/** A `file.zs:line` reference written into the message itself. */
function inlineLocation(message: string, workspaceRoot: string): { frame: ScriptFrame, message: string } | undefined {
  const m = INLINE_LOCATION.exec(message)
  if (!m) return undefined

  const after = message.slice(m.index + m[0].length).trim()
  const before = message.slice(0, m.index).trim()
  const fsPath = resolveScript(m[1], workspaceRoot)
  const line = Math.max(0, Number.parseInt(m[2], 10) - 1)

  return {
    frame  : { uri: vscode.Uri.file(fsPath), line, label: path.basename(fsPath) },
    // Both `foo.zs:12: text` and `Error executing foo.zs:12 > text` keep the
    // interesting half after the location; the lead-in only repeats the file.
    message: after || before,
  }
}

/** Short name of the thrown exception, for the message's `⟦…⟧` badge. */
function exceptionName(body: readonly string[]): string | undefined {
  for (const raw of body) {
    const line = raw.trim().replace(/^Caused by:\s*/, '')
    if (line.startsWith('at ')) break
    const m = EXCEPTION.exec(line)
    if (m) return m[1]
  }
  return undefined
}

/**
 * Points a finding at the `.zs` line that caused it instead of at the log.
 *
 * Two shapes carry that line: the location CraftTweaker prints inside the
 * message, and — for a script that threw through Java — the stack trace below
 * it, where the topmost `.zs` frame is the failing call and the ones under it
 * are the path that reached it.
 */
export const scriptParser: CraftTweakerParser = {
  name: 'script',
  tryParse(ctx: ParseContext) {
    const severity = severityOf(ctx.header.level)
    if (!severity) return undefined

    const frames = scriptFrames(ctx.body, ctx.workspaceRoot)
    const inline = inlineLocation(ctx.header.message, ctx.workspaceRoot)
    const target = frames[0] ?? inline?.frame
    if (!target) return undefined

    const text = inline?.message || ctx.header.message
    const badge = exceptionName(ctx.body)

    return {
      result: {
        severity,
        message   : badge ? `⟦${badge}⟧ ${text}` : text,
        targetUri : target.uri,
        targetLine: target.line,
        originLine: ctx.index,
        scope     : ctx.header.scopes.join('/'),
        related   : frames.slice(1),
      },
      linesConsumed: ctx.body.length,
    }
  },
}
