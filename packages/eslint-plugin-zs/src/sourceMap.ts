import type { LintMessage } from '@mctools/format'

/**
 * Maps lint messages from TS coordinates back to ZS coordinates.
 *
 * v0 placeholder: peggy emits markers but no source map, so we cannot
 * reliably translate positions. Returning the messages unchanged keeps the
 * call-site stable — when the grammar grows a real map, swap in the
 * implementation here without touching `zs-format.ts`.
 */
export function mapBack(messages: ReadonlyArray<LintMessage>): ReadonlyArray<LintMessage> {
  return messages
}
