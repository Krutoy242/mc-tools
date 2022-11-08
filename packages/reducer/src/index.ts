import { resolve } from 'path'
import fast_glob from 'fast-glob'

export const getFileName = (s: string) => s.replace(/^.*[\\/]/, '')

export function getFetchInModsDir(mods: string) {
  /**
   * Return relative to mods/ path (only file name with extension)
   */
  function fetchInModsDir(globPattern: string): string[] {
    return fast_glob.sync(globPattern, { dot: true, cwd: resolve(mods) })
  }
  if (!fetchInModsDir('*.jar?(.disabled)').length)
    throw new Error(`${mods} doesn't have mods in it (files ends with .jar and/or .disabled)`)
  return fetchInModsDir
}
