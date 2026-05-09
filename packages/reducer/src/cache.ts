import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createStorage } from 'unstorage'

import fsDriver from 'unstorage/drivers/fs-lite'

import { hashName } from './theme.js'

/**
 * Cache stored in the OS temp directory keyed by a hash of the modpack path,
 * so it does not pollute the modpack directory or `git status`.
 *
 * Layout: `<os.tmpdir()>/mctools-reducer/<modpackHash>/<key>.json`
 *
 * Files use a flat key per cache entry; the modpack-hash subdirectory keeps
 * different modpacks isolated without nesting deeper than one level.
 */
export function createReducerCache(mcPath: string) {
  const hash = hashName(mcPath).toString(16).padStart(8, '0')
  const base = join(tmpdir(), 'mctools-reducer', hash)
  return createStorage({
    // eslint-disable-next-line ts/no-unsafe-assignment -- fs-lite driver typing isn't surfaced through unstorage's wildcard exports under the root project's tsconfig.
    driver: fsDriver({ base }),
  })
}

export type ReducerCache = ReturnType<typeof createReducerCache>
