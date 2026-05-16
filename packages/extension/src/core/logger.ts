import type * as vscode from 'vscode'

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const

export type LogLevel = keyof typeof LEVELS

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void
  info : (msg: string, meta?: Record<string, unknown>) => void
  warn : (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
  time : (label: string) => () => void
}

export function createLogger(
  channel: vscode.LogOutputChannel,
  module: string,
  level: LogLevel = 'info'
): Logger {
  const minLevel = LEVELS[level]

  const fmt = (msg: string, meta?: Record<string, unknown>): string => {
    const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `[${module}] ${msg}${suffix}`
  }

  const write = (lvl: LogLevel, method: 'debug' | 'info' | 'warn' | 'error') =>
    (msg: string, meta?: Record<string, unknown>) => {
      if (LEVELS[lvl] >= minLevel) channel[method](fmt(msg, meta))
    }

  return {
    debug: write('debug', 'debug'),
    info : write('info', 'info'),
    warn : write('warn', 'warn'),
    error: write('error', 'error'),
    time : (label) => {
      const t0 = performance.now()
      return () => channel.info(fmt(`${label} took ${(performance.now() - t0).toFixed(1)}ms`))
    },
  }
}
