import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Return the resolved absolute path for `f` if it exists on disk,
 * otherwise throw a descriptive error.
 * Intended for yargs `coerce` handlers that accept file/directory paths.
 */
export function assertPath(f: string, errorText?: string): string {
  const resolved = resolve(f)
  if (existsSync(resolved)) return resolved
  throw new Error(`${resolved} ${errorText ?? 'doesnt exist. Provide correct path.'}`)
}
