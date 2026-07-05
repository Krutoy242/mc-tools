import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const pkgs = resolve(root, 'packages').replace(/\\/g, '/')

// Resolve @mctools/<pkg> and @mctools/<pkg>/<sub> workspace imports to source
// so vitest runs against src/ and needs no build.
//
// Some utils subpath exports (mod-resolve, ftbquests, tellme) live under
// src/mods/ and need explicit overrides before the generic subpath rule.
export const mctoolsAlias = [
  // ── utils subpath overrides (export name ≠ file path) ──
  { find: /^@mctools\/utils\/mod-resolve$/,  replacement: `${pkgs}/utils/src/mods/resolve.ts` },
  { find: /^@mctools\/utils\/ftbquests$/,    replacement: `${pkgs}/utils/src/mods/ftbquests.ts` },
  { find: /^@mctools\/utils\/tellme$/,       replacement: `${pkgs}/utils/src/mods/tellme.ts` },
  // ── generic rules ──
  { find: /^@mctools\/([^/]+)\/(.+)$/, replacement: `${pkgs}/$1/src/$2` },
  { find: /^@mctools\/([^/]+)$/, replacement: `${pkgs}/$1/src/index.ts` },
]
