import type { FoundError } from './index.js'
import { styleText } from 'node:util'
import { parseEntry } from './parse.js'

export type Format = 'plain' | 'terminal' | 'markdown'

export function pickFormat(output: string | undefined, isTTY: boolean): Format {
  if (output !== undefined && /\.md$/i.test(output)) return 'markdown'
  if (output === undefined && isTTY) return 'terminal'
  return 'plain'
}

export function renderPlain(errors: FoundError[]): string {
  return errors.map(e => e.text).join('\n')
}

export function renderTerminal(errors: FoundError[]): string {
  const blocks = errors.map((e) => {
    const parsed = parseEntry(e.text)

    if (!parsed.thread && !parsed.level && !parsed.module) {
      return styleText('dim', e.text)
    }

    const timeStr = e.time ? `${styleText('dim', e.time)}  ` : ''
    const threadStr = `${styleText('cyan', parsed.thread!)}  `

    let levelColor: Parameters<typeof styleText>[0] = 'gray'
    if (parsed.level === 'ERROR') levelColor = 'red'
    else if (parsed.level === 'WARN') levelColor = 'yellow'

    const levelStr = `${styleText(levelColor, parsed.level!)}  `
    const moduleStr = styleText('magenta', `[${parsed.module!}]`)

    const header = `${timeStr}${threadStr}${levelStr}${moduleStr}`.trimEnd()
    const msg = parsed.message
    const body = parsed.body ? `\n${styleText('dim', parsed.body)}` : ''

    return `${header}\n${msg}${body}`
  })

  return blocks.join('\n\n')
}

function parseTime(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return (h * 3600 + m * 60 + s) * 1000
}

export function renderMarkdown(errors: FoundError[]): string {
  if (errors.length === 0) return ''

  let t0Str = errors[0].time
  if (!t0Str) {
    const firstWithTime = errors.find(e => e.time)
    t0Str = firstWithTime?.time
  }
  const t0 = t0Str ? parseTime(t0Str) : 0

  let maxDelta = 0
  const buckets: { delta: number, msg: string }[] = []

  const items = errors.map((e) => {
    const parsed = parseEntry(e.text)
    let deltaMin = 0
    if (t0Str && e.time) {
      let current = parseTime(e.time)
      // Simplest robust approach: when computing Δ, if current < t0 add 24*3600*1000.
      if (current < t0) {
        current += 24 * 3600 * 1000
      }
      deltaMin = Math.floor((current - t0) / 60_000)
    }
    if (deltaMin > maxDelta) maxDelta = deltaMin

    let shortMsg = parsed.message
    if (shortMsg.length > 40) shortMsg = `${shortMsg.slice(0, 39)}…`
    shortMsg = shortMsg.replace(/:/g, '\\:').replace(/#/g, '\\#') // Escape for mermaid

    buckets.push({ delta: deltaMin, msg: shortMsg })

    let emoji = '⚪'
    if (parsed.level === 'ERROR') emoji = '🔴'
    else if (parsed.level === 'WARN') emoji = '🟡'

    const levelStr = parsed.level ? `${emoji} ${parsed.level}` : emoji
    const extras = [
      parsed.thread && `\`${parsed.thread}\``,
      parsed.module && `*${parsed.module}*`,
    ].filter(Boolean)
    const metaStr = extras.length > 0 ? `${levelStr}: ${extras.join(' · ')}` : levelStr

    let bodyText: string
    if (parsed.thread !== undefined) {
      bodyText = parsed.body !== undefined
        ? `${parsed.message}\n${parsed.body}`
        : parsed.message
    }
    else {
      bodyText = e.text
    }

    return `### +${deltaMin}min · ${metaStr}\n\n`
      + `\`\`\`\n${bodyText}\n\`\`\``
  })

  let timeline = '```mermaid\ntimeline\n    title Loading timeline (relative)\n'

  const timelineGroups = new Map<number, string[]>()
  for (const b of buckets) {
    let group = timelineGroups.get(b.delta)
    if (!group) timelineGroups.set(b.delta, group = [])
    group.push(b.msg)
  }

  const sortedDeltas = Array.from(timelineGroups.keys()).sort((a, b) => a - b)
  for (const d of sortedDeltas) {
    const msgs = timelineGroups.get(d)!
    timeline += `    +${d}min : ${msgs[0]}\n`
    for (let i = 1; i < msgs.length; i++) {
      timeline += `          : ${msgs[i]}\n`
    }
  }
  timeline += '```\n'

  const header = `# Errors report — ${errors.length} total\n\nTime span: ~${maxDelta} minutes\n\n`

  return `${header + timeline}\n${items.join('\n\n')}\n`
}
