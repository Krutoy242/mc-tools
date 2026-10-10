import { connect, type Socket } from 'node:net'

export interface AgentOptions {
  host?: string
  /** TCP port of the e2ee-agent socket. Env E2EE_AGENT_PORT wins over this. */
  port?: number
  timeoutMs?: number
}

export const DEFAULT_PORT = 6488

export function agentPort(fallback: number = DEFAULT_PORT): number {
  const env = Number.parseInt(process.env.E2EE_AGENT_PORT ?? '', 10)
  return Number.isFinite(env) && env > 0 ? env : fallback
}

/** Send one line-JSON command, resolve with the parsed reply line. */
export function sendCommand(
  cmd: Record<string, unknown>,
  opts: AgentOptions = {},
): Promise<any> {
  const host = opts.host ?? '127.0.0.1'
  const port = agentPort(opts.port)
  const timeoutMs = opts.timeoutMs ?? 15_000
  return new Promise((resolve, reject) => {
    let buf = ''
    let done = false
    const finish = (fn: () => void) => {
      if (!done) {
        done = true
        fn()
      }
    }
    let socket: Socket
    try {
      socket = connect(port, host)
    }
    catch (e) {
      reject(e)
      return
    }
    const timer = setTimeout(() => {
      finish(() => {
        socket.destroy()
        reject(new Error(`e2ee-agent timeout after ${timeoutMs}ms (${host}:${port})`))
      })
    }, timeoutMs)
    socket.on('connect', () => {
      socket.write(JSON.stringify(cmd) + '\n')
    })
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      const line = buf.slice(0, nl)
      clearTimeout(timer)
      finish(() => {
        socket.end()
        try {
          resolve(JSON.parse(line))
        }
        catch (e) {
          reject(new Error(`e2ee-agent bad JSON: ${line.slice(0, 120)}`))
        }
      })
    })
    socket.on('error', (e) => {
      clearTimeout(timer)
      finish(() => reject(e))
    })
  })
}

/** Wait until the socket answers ping (menu or in-world). Never restarts. */
export async function waitForAgent(
  opts: AgentOptions & { waitMs?: number, pollMs?: number } = {},
): Promise<void> {
  const { waitMs = 120_000, pollMs = 500, ...rest } = opts
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      const r = await sendCommand({ cmd: 'ping' }, { ...rest, timeoutMs: 3000 })
      if (r?.ok) return
    }
    catch { /* keep waiting */ }
    if (Date.now() >= deadline) {
      throw new Error('e2ee-agent did not answer ping in time (is the game up?)')
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}
