import process from 'node:process'
import { execa } from 'execa'
import kill from 'tree-kill'

const sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface ProcInfo {
  pid: number
  cmd: string
}

/**
 * List running processes whose executable name matches `exeName`
 * (e.g. `javaw.exe`). Uses CIM on Windows and `ps` elsewhere — no `find-process`
 * dependency. Command lines come back so callers can disambiguate by cwd/args.
 */
export async function listProcesses(exeName: string): Promise<ProcInfo[]> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execa('powershell', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='${exeName.replace(/'/g, '')}'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`,
      ], { timeout: 15_000 })
      return parseCimJson(stdout)
    }
    catch {
      return []
    }
  }
  try {
    const { stdout } = await execa('ps', ['-eo', 'pid=,args='])
    const out: ProcInfo[] = []
    const bare = exeName.replace(/\.exe$/, '')
    for (const line of stdout.split('\n')) {
      // Split on the first whitespace run manually — avoids a backtracking-prone
      // `^(\d+)\s+(.*)$` regex on untrusted, arbitrarily long command lines.
      const t = line.trim()
      const sp = t.search(/\s/)
      if (sp < 0) continue
      const pid = Number(t.slice(0, sp))
      if (!Number.isInteger(pid)) continue
      const cmd = t.slice(sp + 1).trim()
      if (cmd.includes(exeName) || cmd.includes(bare)) out.push({ pid, cmd })
    }
    return out
  }
  catch {
    return []
  }
}

function parseCimJson(stdout: string): ProcInfo[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  }
  catch {
    return []
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  const out: ProcInfo[] = []
  for (const o of arr as { ProcessId?: number, CommandLine?: string | null }[]) {
    if (typeof o?.ProcessId === 'number') {
      out.push({ pid: o.ProcessId, cmd: o.CommandLine ?? '' })
    }
  }
  return out
}

/** Cheap liveness probe — no child process spawned. */
export function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err: unknown) {
    return (err as { code?: string })?.code === 'EPERM'
  }
}

export async function forceKillTree(pid: number): Promise<void> {
  return new Promise(resolve => kill(pid, 'SIGKILL', () => resolve()))
}

/**
 * Stop a process gracefully (close its main window on Windows so the game saves)
 * then force-kill the tree if it lingers.
 */
export async function killProcess(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execa('powershell', [
        '-NoProfile',
        '-Command',
        `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() }`,
      ], { timeout: 15_000 })
    }
    catch { /* fall through to force kill */ }
  }
  for (let waited = 0; waited < 10_000 && running(pid); waited += 500) await sleep(500)
  if (!running(pid)) return

  await forceKillTree(pid)
  for (let waited = 0; waited < 5_000 && running(pid); waited += 250) await sleep(250)
}
