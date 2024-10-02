import stringWidth from 'string-width'

import type { Config } from './config'

import { Task } from './task'

export async function showTerminal(options: {
  config?: Config
  cwd?: string
}) {
  if (!options.config) return

  const oldCwd = process.cwd()
  if (options.cwd) process.chdir(options.cwd)

  const entries = Object.entries(options.config)

  const tasks = entries.map(([name, cmd]) => new Task(name, cmd))

  // Handle files
  const proms = tasks.map(task => task.execute())

  // Draw changes
  process.stdout.write(('\n').repeat(tasks.length - 1))
  const interval = setInterval(draw, 30)

  function composeLines(): string[] {
    const maxColumns = (tasks.length / (process.stdout.rows ?? 20 - 1) + 1) | 0
    const portion = Math.ceil(tasks.length / maxColumns)
    const lines: string[] = []
    const maxBodyWidth = (process.stdout.columns ?? 80 / maxColumns) | 0
    for (let i = 0; i < maxColumns; i++) {
      const slice = tasks.slice(i * portion, (i + 1) * portion)
      const maxNameLen = Math.max(...slice.map(({ name }) => name.length))
      slice.forEach((t, j) => {
        const prev = (lines[j] ?? '')
        const rep = maxBodyWidth * i - stringWidth(prev)
        lines[j] = prev + (i === 0 || rep <= 0 ? '' : ' '.repeat(rep))
        + t.flush(maxNameLen, maxBodyWidth)
      })
    }
    return lines
  }

  function draw() {
    if (!tasks.some(t => t.dirty)) return

    // \u001B[1A - move cursor up
    // \u001B[2K - clear line
    // \u001B[1G - cursor to 0
    const lines = composeLines()
    const moveCursor = '\u001B[1A\u001B[2K'.repeat(lines.length - 1)
    process.stdout.write(`${moveCursor}\u001B[1G${lines.join('\n')}`)
  }

  await Promise.all(proms)
  clearInterval(interval)
  draw() // Draw errors if have
  process.stdout.write('\n')

  // Show errors in separated lines
  const errs = tasks
    .map(t => t.flushErrors())
    .filter(Boolean)
    .join('\n')
  if (errs.trim()) process.stdout.write(`${errs}\n`)

  if (options.cwd) process.chdir(oldCwd)
  return composeLines().join('\n')
}
