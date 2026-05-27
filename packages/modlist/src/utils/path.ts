import { fileURLToPath } from 'node:url'

export function relative(relPath: string): string {
  return fileURLToPath(new URL(relPath, import.meta.url))
}
