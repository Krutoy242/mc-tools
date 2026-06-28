import type { LauncherConfig } from '../config.js'
import type { Launcher } from './types.js'
import process from 'node:process'
import { execaCommand } from 'execa'
import { normalize } from 'pathe'
import { killProcess, listProcesses } from './process.js'

/**
 * Config-driven launcher: launches via an arbitrary shell command and finds the
 * running game by scanning processes for `processName` whose command line
 * matches `processMatch` (defaults to the modpack directory). Lets users on
 * non-Windows / non-PrismLauncher setups plug in their own launcher.
 */
export class CommandLauncher implements Launcher {
  readonly name = 'command'
  private readonly exeName: string
  private readonly matcher: RegExp

  constructor(private readonly mcDir: string, private readonly cfg: LauncherConfig) {
    this.exeName = cfg.processName ?? 'javaw.exe'
    const pattern = cfg.processMatch ?? escapeRegExp(normalize(mcDir).replace(/\\/g, '/'))
    this.matcher = new RegExp(pattern, 'i')
  }

  async getPid(): Promise<number | null> {
    const list = await listProcesses(this.exeName)
    for (const proc of list) {
      const cmd = proc.cmd.replace(/\\/g, '/')
      if (this.matcher.test(cmd)) return proc.pid
    }
    return null
  }

  async launch(): Promise<void> {
    if (!this.cfg.launch) {
      throw new Error('launcher.kind="command" requires launcher.launch in reducer.config')
    }
    await execaCommand(this.cfg.launch, { cwd: this.mcDir, detached: true, stdio: 'ignore', env: process.env }).catch(() => {})
  }

  async kill(pid: number): Promise<void> {
    await killProcess(pid)
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
