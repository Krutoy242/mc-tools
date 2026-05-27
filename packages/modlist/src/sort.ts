import type { InstalledAddon } from '@mctools/curseforge/minecraftinstance'
import type { AddonDifference } from './types.js'
import { getPath } from './utils/object.js'

export function createSortFn(sortKey: string): (a: AddonDifference | InstalledAddon, b: AddonDifference | InstalledAddon) => number {
  let sortDirection = 1
  let key = sortKey

  if (key.startsWith('/')) {
    sortDirection = -1
    key = key.substring(1)
  }

  return (a, b) => {
    const av = getPath(a, key, 0) as number
    const bv = getPath(b, key, 0) as number
    return sortDirection * (av - bv)
  }
}
