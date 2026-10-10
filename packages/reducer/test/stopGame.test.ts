import type { Launcher } from '../src/launcher/types.js'
import { describe, expect, it } from 'vitest'
import { ensureGameStopped } from '../src/core/stopGame.js'

/** Launcher whose pid follows a scripted sequence, one step per `getPid` call. */
function scripted(pids: (number | null)[], onKill: (pid: number) => void = () => {}): Launcher & { kills: number[] } {
  let i = 0
  const kills: number[] = []
  return {
    name  : 'fake',
    kills,
    getPid: async () => pids[Math.min(i++, pids.length - 1)],
    launch: async () => {},
    kill  : async (pid: number) => {
      kills.push(pid)
      onKill(pid)
    },
  }
}

describe('ensureGameStopped', () => {
  it('is a no-op when nothing runs', async () => {
    const lines: string[] = []
    const l = scripted([null])
    await ensureGameStopped(l, m => void lines.push(m))
    expect(l.kills).toEqual([])
    expect(lines).toEqual([])
  })

  it('kills and waits out the exit before returning', async () => {
    const lines: string[] = []
    const l = scripted([7, 7, null])
    await ensureGameStopped(l, m => void lines.push(m))
    expect(l.kills).toEqual([7])
    expect(lines).toEqual(['killed existing fake PID 7'])
  })

  it('warns instead of hanging when the process refuses to die', async () => {
    const lines: string[] = []
    const l = scripted([9])
    await ensureGameStopped(l, m => void lines.push(m), { timeoutMs: 100 })
    expect(l.kills).toEqual([9])
    expect(lines[0]).toBe('killed existing fake PID 9')
    expect(lines[1]).toMatch(/still alive.*locked files/)
  })

  it('never kills on dry runs', async () => {
    const lines: string[] = []
    const l = scripted([7])
    await ensureGameStopped(l, m => void lines.push(m), { dry: true })
    expect(l.kills).toEqual([])
    expect(lines).toEqual(['would stop fake PID 7 before renaming mods (assumed).'])
  })
})
