/**
 * Natural string comparator — sorts "mod-v2" before "mod-v10".
 * Meant for `Array.prototype.sort(naturalSort)`.
 */
export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
