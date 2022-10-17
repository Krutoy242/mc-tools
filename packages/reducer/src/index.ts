import { resolve } from 'path'
import fast_glob from 'fast-glob'

export function getFetchInModsDir(mods: string) {
  return function fetchInModsDir(globPattern: string): string[] {
    return fast_glob.sync(globPattern, { dot: true, cwd: resolve(mods) })
  }
}
