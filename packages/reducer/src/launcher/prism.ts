import type { Launcher } from './types.js'
import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import { isAbsolute, join, normalize, resolve } from 'pathe'
import { forceKillTree, killProcess, listProcesses, running } from './process.js'

const IS_WIN = process.platform === 'win32'

/** Canonical, comparable form of a path (case-insensitive on Windows). */
function pathKey(p: string): string {
  let s = normalize(p)
    .replace(/\\/g, '/')
    .replace(/^\/\/\?\//, '')
    .replace(/\/+$/, '')
  if (IS_WIN) s = s.toLowerCase()
  return s
}

function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b)
}

/** Comparable form of a whole command line (slashes + case only, no normalize). */
function cmdKey(cmd: string): string {
  const s = cmd.replace(/\\/g, '/')
  return IS_WIN ? s.toLowerCase() : s
}

/** A resolved PrismLauncher instance and the roots it was found under. */
interface ResolvedInstance {
  /** Instance id — the folder name, what `--launch` takes. */
  id      : string
  /** Absolute path of the instance folder. */
  dir     : string
  dataDir : string
  /** All instance roots of `dataDir`, used to attribute running processes. */
  roots   : string[]
  /** `lastLaunchTime` from `instance.cfg` (epoch ms, 0 if never launched). */
  launched: number
}

/**
 * Every plausible PrismLauncher data dir, in priority order — *all* of them, so
 * the caller can pick the one that actually holds this pack instead of blindly
 * taking the first that exists (a stale AppData profile has a completely
 * different `InstanceDir` and would silently launch a different pack).
 */
async function getPrismDataDirs(): Promise<string[]> {
  if (process.env.PRISMLAUNCHER_DATA_DIR) return [normalize(process.env.PRISMLAUNCHER_DATA_DIR)]
  const dirs: string[] = []
  const programFiles = [
    'D:\\Program Files\\PrismLauncher',
    'C:\\Program Files\\PrismLauncher',
    'C:\\Program Files (x86)\\PrismLauncher',
  ]
  for (const c of programFiles) {
    try {
      await fs.access(join(c, 'portable.txt'), fsConstants.R_OK)
      dirs.push(normalize(c))
    }
    catch { /* not portable here */ }
  }
  const envPaths = (await import('env-paths')).default
  const appData = envPaths('prismlauncher', { suffix: '' }).data
  try {
    await fs.access(appData, fsConstants.R_OK)
    dirs.push(normalize(appData))
  }
  catch { /* no roaming profile */ }
  if (!dirs.length) {
    throw new Error('Cannot find PrismLauncher data dir. Set PRISMLAUNCHER_DATA_DIR or install PrismLauncher.')
  }
  return dirs
}

async function getInstanceDirs(dataDir: string): Promise<string[]> {
  const dirs: string[] = []
  try {
    const cfg = await fs.readFile(join(dataDir, 'prismlauncher.cfg'), 'utf-8')
    const match = cfg.match(/^InstanceDir=(.+)$/m)
    if (match) {
      let dir = match[1].trim()
      if (!isAbsolute(dir)) dir = join(dataDir, dir)
      dirs.push(normalize(dir))
    }
  }
  catch { /* ignore */ }
  dirs.push(join(dataDir, 'instances'))
  return dirs
}

/**
 * Game dir an instance folder runs, or `null` if it has none. Both the Prism
 * (`.minecraft`) and MultiMC (`minecraft`) layouts are accepted, as symlink,
 * NTFS junction or plain directory — an instance using the dotless name used to
 * be invisible here, which silently handed the launch to a *different* instance
 * pointing at the same pack.
 */
async function instanceGameDir(instancePath: string): Promise<string | null> {
  for (const name of ['.minecraft', 'minecraft']) {
    const linkPath = join(instancePath, name)
    try {
      const stats = await fs.lstat(linkPath)
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(linkPath)
        return isAbsolute(target) ? target : resolve(instancePath, target)
      }
      if (stats.isDirectory()) return linkPath
    }
    catch { /* not this layout */ }
  }
  return null
}

/** Every instance under `rootDir` whose game dir is `mcDir` (not just the first). */
async function findInstancesInDir(rootDir: string, mcDir: string): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  }
  catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const gameDir = await instanceGameDir(join(rootDir, entry.name))
    if (gameDir && samePath(gameDir, mcDir)) found.push(entry.name)
  }
  return found
}

/** `lastLaunchTime` of an instance (epoch ms); 0 when unknown/never launched. */
async function lastLaunchTime(instanceDir: string): Promise<number> {
  try {
    const cfg = await fs.readFile(join(instanceDir, 'instance.cfg'), 'utf-8')
    return Number(cfg.match(/^lastLaunchTime=(\d+)$/m)?.[1]) || 0
  }
  catch {
    return 0
  }
}

const LOADER_NAMES: Record<string, string> = {
  'com.mumfrey.liteloader'    : 'LiteLoader',
  'net.fabricmc.fabric-loader': 'Fabric',
  'net.minecraftforge'        : 'Forge',
  'net.neoforged'             : 'NeoForge',
  'org.quiltmc.quilt-loader'  : 'Quilt',
}

/**
 * One-line "what am I actually booting" summary from `mmc-pack.json`, e.g.
 * `MC 1.12.2 · Forge 14.23.5.2860`. Two instances can point at the same pack
 * with wildly different loaders/Java, so this goes into the launch log.
 */
async function packSummary(instanceDir: string): Promise<string | null> {
  interface Component { uid?: string, version?: string, cachedName?: string, cachedVersion?: string, dependencyOnly?: boolean }
  let components: Component[]
  try {
    const pack = JSON.parse(await fs.readFile(join(instanceDir, 'mmc-pack.json'), 'utf-8')) as { components?: Component[] }
    components = pack.components ?? []
  }
  catch {
    return null
  }
  const parts: string[] = []
  for (const c of components) {
    if (!c.uid || c.dependencyOnly || c.uid.startsWith('org.lwjgl')) continue
    const version = c.version ?? c.cachedVersion ?? ''
    if (c.uid === 'net.minecraft') parts.unshift(`MC ${version}`)
    else parts.push(`${LOADER_NAMES[c.uid] ?? c.cachedName ?? c.uid} ${version}`.trim())
  }
  return parts.join(' · ') || null
}

/**
 * Instance id a running process belongs to, or `null` if it can't be
 * attributed. PrismLauncher puts the instance's own `natives` dir on the JVM
 * command line, so a process under a known instance root is attributable with
 * certainty — and one attributed to *another* instance must never be treated as
 * ours (it is a different game the user is playing).
 */
function instanceIdInCmd(cmd: string, roots: string[]): string | null {
  const key = cmdKey(cmd)
  for (const root of roots) {
    const prefix = `${pathKey(root)}/`
    const at = key.indexOf(prefix)
    if (at < 0) continue
    const seg = key.slice(at + prefix.length).split(/[/"\s]/)[0]
    if (seg) return seg
  }
  return null
}

/**
 * Relative path (from the instance's `.minecraft` dir) of the *generated*
 * auto-join marker script. `scripts/mixin/probezs/shared.zs`'s
 * `Op.tryAutoJoinWorld()` reads `AutoJoinMarker.world` (rewritten fresh by
 * this function before every launch) once, when the first screen finishes
 * `setWorldAndResolution` (see `scripts/mixin/probezs/gui.zs`, which hooks
 * vanilla `GuiScreen` and so covers any main-menu replacement), and calls
 * `launchIntegratedServer` directly — GUI init always runs on the main client
 * thread, so there's no cross-thread marshaling problem, and no dependency on
 * PrismLauncher's own (Custom-Main-Menu-defeated) `--world` flag.
 *
 * A generated `.zs` file is used instead of a plain marker file because
 * ZenUtils blacklists file I/O from ZenScript's native access (even inside
 * mixin-loader scripts) — but `.zs` source itself is freely re-read by the
 * script loader on every boot, sidestepping that sandbox entirely.
 */
const AUTOJOIN_MARKER_REL = ['scripts', 'mixin', 'probezs', 'autojoin_marker.zs']

function autoJoinMarkerSource(world: string | null): string {
  // Escape for a single-quoted ZenScript string literal.
  const escaped = (world ?? '').replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
  return `#modloaded probezs
#loader mixin
#priority 4000

// ── Auto-join marker (generated) ────────────────────────────
// Rewritten by mc-tools/packages/reducer/src/launcher/prism.ts's
// writeAutoJoinMarker() immediately before every launch — do not hand-edit
// \`world\`, it is overwritten on every launch. Empty string means "don't
// auto-join anything".
zenClass AutoJoinMarker {
  static world as string = '${escaped}';
}
`
}

/**
 * Regenerate the auto-join marker script so the GUI mixin knows which
 *  save, if any, to load once the main menu appears.
 */
async function writeAutoJoinMarker(mcDir: string, world: string | null): Promise<void> {
  const markerPath = join(mcDir, ...AUTOJOIN_MARKER_REL)
  await fs.writeFile(markerPath, autoJoinMarkerSource(world), 'utf-8')
}

/** Most recent world by `level.dat` mtime (dir mtime is unreliable on Windows). */
async function detectLatestWorld(mcDir: string): Promise<string | null> {
  let entries
  try {
    entries = await fs.readdir(join(mcDir, 'saves'), { withFileTypes: true })
  }
  catch {
    return null
  }
  let latest: string | null = null
  let latestMtime = 0
  for (const d of entries) {
    if (!d.isDirectory()) continue
    let mtime = 0
    for (const marker of ['level.dat', 'level.dat_old']) {
      try {
        mtime = Math.max(mtime, (await fs.stat(join(mcDir, 'saves', d.name, marker))).mtimeMs)
      }
      catch { /* marker missing */ }
    }
    if (mtime > latestMtime) {
      latestMtime = mtime
      latest = d.name
    }
  }
  return latest
}

/**
 * Windows + PrismLauncher launcher. Picks the most recently launched instance
 * whose game dir resolves to `mcDir`, launches the newest world with `--alive`,
 * and finds the game `javaw` by command-line cwd match (plus its crash-assistant
 * watchdog).
 */
export class PrismLauncher implements Launcher {
  readonly name = 'prismlauncher'
  private instance?: ResolvedInstance

  constructor(private readonly mcDir: string) {}

  /**
   * The instance to drive: of all instances whose game dir is `mcDir`, the one
   * the user launched most recently (`lastLaunchTime` in `instance.cfg`). Several
   * instances routinely point at one pack (a Java-8 and a Java-25 copy, say);
   * "last launched" follows whichever the user actually switched to, instead of
   * depending on readdir order — and renaming pack or instance changes nothing.
   */
  private async resolveInstance(): Promise<ResolvedInstance> {
    if (this.instance) return this.instance
    const searched: string[] = []
    const matches: ResolvedInstance[] = []

    for (const dataDir of await getPrismDataDirs()) {
      const roots = [...new Set(await getInstanceDirs(dataDir))]
      searched.push(...roots)
      for (const root of roots) {
        for (const id of await findInstancesInDir(root, this.mcDir)) {
          const dir = join(root, id)
          matches.push({ dataDir, dir, id, launched: await lastLaunchTime(dir), roots })
        }
      }
    }

    if (!matches.length) {
      throw new Error(`No PrismLauncher instance maps to ${this.mcDir}. Searched:\n  ${searched.join('\n  ')}`)
    }
    matches.sort((a, b) => b.launched - a.launched)
    this.instance = matches[0]
    return this.instance
  }

  /** `E2EE · MC 1.12.2 · Forge 14.23.5.2860` — one line, for the launch log. */
  async describe(): Promise<string> {
    const inst = await this.resolveInstance()
    const summary = await packSummary(inst.dir)
    return summary ? `${inst.id} · ${summary}` : inst.id
  }

  /**
   * PID of *our* game. Processes attributable to another instance are skipped
   * outright — the old "first javaw with EntryPoint" fallback happily returned
   * someone else's game, so `kill` could shoot down an unrelated session. The
   * lone-unattributable process is still accepted (non-Prism-standard command
   * lines), but only when it is the only candidate.
   */
  async getPid(): Promise<number | null> {
    const inst = await this.resolveInstance()
    const list = (await listProcesses('javaw.exe')).filter(p => p.cmd.includes('EntryPoint'))
    const mcKey = pathKey(this.mcDir)
    const dirKey = pathKey(inst.dir)
    const idKey = IS_WIN ? inst.id.toLowerCase() : inst.id
    const unattributed: number[] = []
    for (const proc of list) {
      const cmd = cmdKey(proc.cmd)
      const owner = instanceIdInCmd(proc.cmd, inst.roots)
      if (owner !== null) {
        if (owner === idKey) return proc.pid
        continue // definitely another instance — leave it alone
      }
      if (cmd.includes(dirKey) || cmd.includes(mcKey)) return proc.pid
      unattributed.push(proc.pid)
    }
    return unattributed.length === 1 ? unattributed[0] : null
  }

  async launch(): Promise<void> {
    const { id: instanceId } = await this.resolveInstance()
    // E2EE_FORCE_WORLD overrides world detection — used by tests that must
    // target a specific save (e.g. "TEST_WORLD") without changing the
    // default "latest played" behavior real users get.
    const world = process.env.E2EE_FORCE_WORLD || await detectLatestWorld(this.mcDir)
    await writeAutoJoinMarker(this.mcDir, world)
    const isSsh = process.env.SSH_CLIENT || process.env.SSH_CONNECTION || process.env.SSH_TTY
    if (isSsh) {
      const taskName = `PrismLaunch_${Date.now()}`
      const worldArg = world ? ` --world "${world}"` : ''
      await execa('schtasks', [
        '/create',
        '/tn',
        taskName,
        '/tr',
        `cmd.exe /c "prismlauncher --launch ${instanceId}${worldArg} --alive"`,
        '/sc',
        'once',
        '/st',
        '00:00',
        '/it',
        '/f',
      ])
      await execa('schtasks', ['/run', '/tn', taskName])
      await execa('schtasks', ['/delete', '/tn', taskName, '/f'])
      return
    }
    const args = ['--launch', instanceId]
    if (world) args.push('--world', world)
    args.push('--alive')
    spawn('prismlauncher', args, { detached: true, stdio: 'ignore' }).unref()
  }

  async kill(gamePid: number): Promise<void> {
    // The crash-assistant watchdog is a separate javaw whose classpath
    // references the game PID; kill it too so we don't leak a JVM per restart.
    const helpers: number[] = []
    const list = await listProcesses('javaw.exe')
    const jarRef = new RegExp(`crash_assistant[\\\\/]${gamePid}_`, 'i')
    for (const proc of list) {
      if (proc.pid !== gamePid && jarRef.test(proc.cmd)) helpers.push(proc.pid)
    }
    await killProcess(gamePid)
    for (const helper of helpers) {
      if (running(helper)) await forceKillTree(helper)
    }
  }
}
