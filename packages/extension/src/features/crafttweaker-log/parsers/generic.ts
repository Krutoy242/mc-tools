import type { CraftTweakerParser, ParseContext } from './base.js'
import { severityOf } from './base.js'

/** Last resort: report the entry where it was logged, without a script target. */
export const genericParser: CraftTweakerParser = {
  name: 'generic',
  tryParse(ctx: ParseContext) {
    const severity = severityOf(ctx.header.level)
    if (!severity) return undefined

    return {
      result: {
        severity,
        // An entry whose whole text sat inside the brackets still deserves a
        // message, so fall back to the line itself.
        message   : ctx.header.message || ctx.lines[ctx.index].trim(),
        originLine: ctx.index,
        scope     : ctx.header.scopes.join('/'),
      },
      linesConsumed: 0,
    }
  },
}
