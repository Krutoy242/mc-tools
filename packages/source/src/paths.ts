import fs from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Join `name` onto `dir`, spelled the way the filesystem spells it. Windows
 * lookups are case-insensitive, so a plain `join()` reports back the casing of
 * the query rather than of the folder it found (`jeibees` → `JEIBees`).
 * Falls back to the literal join when no such folder exists.
 */
export async function sourcePath(dir: string, name: string): Promise<string> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const real = entries.find(e => e.isDirectory() && e.name.toLowerCase() === name.toLowerCase())
    if (real) return join(dir, real.name)
  }
  catch { /* unreadable directory — nothing to correct against */ }
  return join(dir, name)
}
