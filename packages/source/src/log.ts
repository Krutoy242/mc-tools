import type { Logger } from './types.js'
import process from 'node:process'

/**
 * Build a {@link Logger}. By default writes to stderr so that stdout stays
 * clean for the single result path. `silent` returns a no-op sink.
 */
export function makeLogger(silent = false): Logger {
  if (silent) return () => {}
  return (msg, newline = true) => {
    process.stderr.write(msg + (newline ? '\n' : ''))
  }
}
