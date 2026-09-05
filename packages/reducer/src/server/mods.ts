import type { ModdedAddon } from '../Mod.js'
import type { Excluded } from './exclude.js'
import { cpSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { link } from 'node:fs/promises'
import { join, resolve } from 'pathe'
import { isExcluded } from './exclude.js'

/**
 * @file The server's `mods/` — hardlinks to the pack's jars.
 *
 * Hardlinks, not copies: same volume, no admin rights, no second gigabyte on
 * disk, and a jar swapped by an update is picked up by the size+mtime check
 * below. The point of a separate directory is that the two mod *sets* are
 * independent — reducer disables a jar here by renaming this link, which the
 * client's `mods/` never sees, so a reduced server can run next to a full
 * client out of one pack folder.
 */

/** Strip `.jar`/`.disabled` so a jar keeps one identity across toggles. */
export function baseOf(fileName: string): string {
  return fileName.replace(/(?:\.disabled)+$/i, '').replace(/\.jar$/i, '')
}

export interface JarFile {
  base    : string
  fileName: string
  size    : number
  mtimeMs : number
  disabled: boolean
}

export interface SyncPlan {
  /** Jars to hardlink in, with the name (and thus the state) they get. */
  link    : { base: string, from: string, to: string }[]
  /** Server-side names to delete: gone from the pack, or newly excluded. */
  remove  : string[]
  /** Jars the pack has but the server must not load. */
  excluded: string[]
  /** Links already in place and current. */
  kept    : number
}

/**
 * Decide what the server's mods dir must gain and lose.
 *
 * Pure, because the interesting part is the *state* rule: a jar already linked
 * keeps whatever enable/disable state the server gave it, and only its content
 * is refreshed. Mirroring the client's state on every sync would undo the
 * reduced set on the next boot; mirroring it once, when the link is first
 * created, is what makes a fresh server dir usable straight away.
 */
export function planModSync(source: JarFile[], dest: JarFile[], excluded: (jar: JarFile) => boolean): SyncPlan {
  const byBase = new Map(dest.map(d => [d.base, d]))
  const plan: SyncPlan = { link: [], remove: [], excluded: [], kept: 0 }
  const seen = new Set<string>()

  for (const jar of source) {
    seen.add(jar.base)
    const current = byBase.get(jar.base)
    if (excluded(jar)) {
      plan.excluded.push(jar.fileName)
      if (current) plan.remove.push(current.fileName)
      continue
    }
    if (current) {
      if (current.size === jar.size && current.mtimeMs === jar.mtimeMs) {
        plan.kept++
        continue
      }
      // A replaced jar is a different file — relink, but under the name the
      // server chose, so an update never re-enables what a bisect disabled.
      plan.remove.push(current.fileName)
      plan.link.push({ base: jar.base, from: jar.fileName, to: current.fileName })
      continue
    }
    plan.link.push({ base: jar.base, from: jar.fileName, to: `${jar.base}.jar${jar.disabled ? '.disabled' : ''}` })
  }

  for (const d of dest) {
    if (!seen.has(d.base)) plan.remove.push(d.fileName)
  }
  return plan
}

/** Every `*.jar[.disabled]` of a mods dir, with the stats the sync compares. */
export function readJarDir(dir: string): JarFile[] {
  const out: JarFile[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return out
  }
  for (const fileName of entries) {
    if (!/\.jar(?:\.disabled)*$/i.test(fileName)) continue
    let stat
    try {
      stat = statSync(join(dir, fileName))
    }
    catch {
      continue // vanished between readdir and stat
    }
    if (!stat.isFile()) continue
    out.push({
      base    : baseOf(fileName),
      fileName,
      size    : stat.size,
      mtimeMs : stat.mtimeMs,
      disabled: !/\.jar$/i.test(fileName),
    })
  }
  return out
}

/** Create a directory junction (Windows) / symlink, replacing a stale one. */
export function linkDir(target: string, dest: string): void {
  const stat = lstatSync(dest, { throwIfNoEntry: false })
  if (stat) {
    // A real directory here means someone put files in it — never delete that.
    if (!stat.isSymbolicLink()) return
    if (resolve(readlinkSync(dest)) === resolve(target)) return
    rmSync(dest, { recursive: true, force: true })
  }
  mkdirSync(join(dest, '..'), { recursive: true })
  symlinkSync(target, dest, 'junction')
}

export interface SyncSummary extends SyncPlan {
  enabled: number
  total  : number
}

/**
 * Bring `<gameDir>/mods` in line with the pack's, minus the excluded jars.
 * Subdirectories are junctioned as a whole: `mods/<mcversion>/` holds loader
 * libraries Forge reads from a version folder, never client-only jars.
 */
export async function syncServerMods(
  packDir : string,
  gameDir : string,
  excluded: Excluded,
  addonOf : (fileName: string) => ModdedAddon | undefined,
  dry     : boolean
): Promise<SyncSummary> {
  const src = join(packDir, 'mods')
  const dest = join(gameDir, 'mods')
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && !dry) linkDir(join(src, entry.name), join(dest, entry.name))
  }

  const source = readJarDir(src)
  const plan = planModSync(source, readJarDir(dest), (jar) => {
    const addon = addonOf(jar.fileName)
    return isExcluded(excluded, { fileName: jar.fileName, addonID: addon?.addonID, name: addon?.name })
  })

  if (!dry) {
    for (const stale of plan.remove) rmSync(join(dest, stale), { force: true })
    for (const { from, to } of plan.link) {
      try {
        await link(join(src, from), join(dest, to))
      }
      catch {
        // Different volume, or the jar is locked by a running game.
        cpSync(join(src, from), join(dest, to), { preserveTimestamps: true })
      }
    }
  }

  // Read back rather than project: in a dry run these numbers then describe the
  // set that is on disk *now*, which is what "nothing was changed" means.
  const now = readJarDir(dest)
  return {
    ...plan,
    enabled: now.filter(j => !j.disabled).length,
    total  : now.length,
  }
}
