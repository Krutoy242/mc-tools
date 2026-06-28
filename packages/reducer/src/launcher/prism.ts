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

async function getPrismDataDir(): Promise<string> {
  if (process.env.PRISMLAUNCHER_DATA_DIR) return normalize(process.env.PRISMLAUNCHER_DATA_DIR)
  const programFiles = [
    'D:\\Program Files\\PrismLauncher',
    'C:\\Program Files\\PrismLauncher',
    'C:\\Program Files (x86)\\PrismLauncher',
  ]
  for (const c of programFiles) {
    try {
      await fs.access(join(c, 'portable.txt'), fsConstants.R_OK)
      return normalize(c)
    }
    catch { /* not portable here */ }
  }
  const envPaths = (await import('env-paths')).default
  const appData = envPaths('prismlauncher', { suffix: '' }).data
  try {
    await fs.access(appData, fsConstants.R_OK)
    return normalize(appData)
  }
  catch {
    throw new Error('Cannot find PrismLauncher data dir. Set PRISMLAUNCHER_DATA_DIR or install PrismLauncher.')
  }
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

async function findInstanceInDir(rootDir: string, mcDir: string): Promise<string | null> {
  let entries
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  }
  catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const instancePath = join(rootDir, entry.name)
    const mcLinkPath = join(instancePath, '.minecraft')
    let realPath: string | null = null
    try {
      const stats = await fs.lstat(mcLinkPath)
      if (stats.isSymbolicLink()) {
        const target = await fs.readlink(mcLinkPath)
        realPath = isAbsolute(target) ? target : resolve(instancePath, target)
      }
      else if (stats.isDirectory()) {
        realPath = mcLinkPath
      }
    }
    catch {
      continue
    }
    if (realPath && samePath(realPath, mcDir)) return entry.name
  }
  return null
}

async function detectInstance(dataDir: string, mcDir: string): Promise<string | null> {
  for (const rootDir of await getInstanceDirs(dataDir)) {
    const id = await findInstanceInDir(rootDir, mcDir)
    if (id) return id
  }
  return null
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
 * Windows + PrismLauncher launcher. Detects the instance whose `.minecraft`
 * resolves to `mcDir`, launches the newest world with `--alive`, and finds the
 * game `javaw` by command-line cwd match (plus its crash-assistant watchdog).
 */
export class PrismLauncher implements Launcher {
  readonly name = 'prismlauncher'
  private instanceId?: string

  constructor(private readonly mcDir: string) {}

  private async resolveInstance(): Promise<string> {
    if (this.instanceId) return this.instanceId
    const dataDir = await getPrismDataDir()
    const id = await detectInstance(dataDir, this.mcDir)
    if (!id) {
      throw new Error('No PrismLauncher instance maps to this directory. Run from inside the .minecraft folder.')
    }
    this.instanceId = id
    return id
  }

  async getPid(): Promise<number | null> {
    const list = await listProcesses('javaw.exe')
    const needle = pathKey(this.mcDir)
    let fallback: number | null = null
    for (const proc of list) {
      if (!proc.cmd.includes('EntryPoint')) continue
      fallback ??= proc.pid
      if (pathKey(proc.cmd).includes(needle)) return proc.pid
    }
    return fallback
  }

  async launch(): Promise<void> {
    const instanceId = await this.resolveInstance()
    const world = await detectLatestWorld(this.mcDir)
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
