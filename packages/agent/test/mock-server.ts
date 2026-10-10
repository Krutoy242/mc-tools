import { createServer, type Server } from 'node:net'

// Minimal in-test mock of the e2ee-agent socket (line-JSON, one cmd/conn).
export async function createMockAgent(): Promise<{ port: number, close: () => Promise<void> }> {
  const server: Server = createServer((socket) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      if (!buf.includes('\n')) return
      const line = buf.slice(0, buf.indexOf('\n'))
      buf = buf.slice(buf.indexOf('\n') + 1)
      let req: any = {}
      try { req = JSON.parse(line) } catch { /* keep {} */ }
      let reply: any = { ok: false, err: 'unknown cmd' }
      if (req.cmd === 'ping') reply = { ok: true }
      else if (req.cmd === 'cmd') reply = { ok: true, output: 'Daytime 12345' }
      else if (req.cmd === 'state') {
        reply = { ok: true, pos: { x: 1, y: 2, z: 3 }, screen: 'none', inv: [] }
      }
      socket.write(JSON.stringify(reply) + '\n')
      socket.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(6499, '127.0.0.1', resolve))
  return {
    port: 6499,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))),
  }
}
