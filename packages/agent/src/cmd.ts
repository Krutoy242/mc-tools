import { sendCommand, type AgentOptions } from './client.ts'

export interface CmdResult {
  command: string
  // MIGRATION BOUNDARY (advisor review 2026-10-08, item 4): uuid/reply exist
  // only for shape-compat with the old RMI path (run-cmd.ts reads .reply).
  // Switch callers to .output, then delete both fields.
  uuid: string
  ok: boolean
  reply: string
  output: string
  ms: number
}

export interface AgentPos { x: number, y: number, z: number, yaw: number, pitch: number, health: number }
export interface AgentState {
  ok: boolean
  pos: AgentPos
  screen: string
  inv: Array<{ id: string, n: number, dmg: number } | null>
}

function shortUuid(): string {
  return Math.random().toString(16).slice(2, 8)
}

/**
 * Run a Minecraft command through the mod (`{"cmd":"cmd"}` on the server
 * thread with captured sender output). Same return shape as the old RMI path.
 */
export async function execCmd(cmd: string, opts: AgentOptions = {}): Promise<CmdResult> {
  const command = cmd.startsWith('/') ? cmd : `/${cmd}`
  if (command.trim() === '/') throw new Error('Empty command')
  const uuid = shortUuid()
  const t0 = performance.now()
  const r = await sendCommand({ cmd: 'cmd', text: command }, opts)
  const output = String(r?.output ?? r?.reply ?? '')
  return {
    command,
    uuid,
    ok: r?.ok === true,
    reply: output,
    output,
    ms: performance.now() - t0,
  }
}

/** One snapshot: pos + screen + open-state inventory (best-effort same tick). */
export async function state(opts: AgentOptions = {}): Promise<AgentState> {
  const r = await sendCommand({ cmd: 'state' }, opts)
  // Fail loudly, not with zeroed fields: a silent zero-pos poisons callers
  // (advisor review 2026-10-08, item 3). execCmd keeps ok:false for chains.
  if (r?.ok !== true) {
    throw new Error(`e2ee-agent state failed: ${JSON.stringify(r).slice(0, 200)}`)
  }
  if (typeof r?.pos?.x !== 'number' || typeof r?.screen !== 'string' || !Array.isArray(r?.inv)) {
    throw new Error(`e2ee-agent state malformed: ${JSON.stringify(r).slice(0, 200)}`)
  }
  return { ok: true, pos: r.pos, screen: r.screen, inv: r.inv }
}
