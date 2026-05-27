const QUERY_INDEX_REGEX = /\[(\d+)\]/g
const QUERY_DOT_REGEX = /^\./

/** Typed lodash.get-lite. Returns `defaultVal` when path cannot be resolved. */
export function getPath(obj: unknown, query: string, defaultVal?: unknown): unknown {
  const parts = query.replace(QUERY_INDEX_REGEX, '.$1').replace(QUERY_DOT_REGEX, '').split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return defaultVal
    if (!(part in cur)) return defaultVal
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}
