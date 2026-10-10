import { describe, expect, test } from 'vitest'

const { execCmd, sendCommand, state } = await import('../src/index.ts')

// Gate: live scenarios only run against a real game; otherwise skipped.
async function pingQuick(): Promise<boolean> {
  try {
    const r: any = await sendCommand({ cmd: 'ping' }, { timeoutMs: 3000 })
    return r?.ok === true
  }
  catch {
    return false
  }
}
const LIVE = await pingQuick()

const num = (s: string): number => Number((s.match(/-?\d+/) ?? ['NaN'])[0])

describe.skipIf(!LIVE)('live world', () => {
  test('cmd roundtrip: time advances', async () => {
    const a = await execCmd('time query daytime')
    const b = await execCmd('/time query daytime')
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(num(b.output)).toBeGreaterThanOrEqual(num(a.output))
  })

  test('chest sort: dirt lands in chest A (8002/4/8000)', async () => {
    const give = await execCmd('/give Krutoy242 minecraft:dirt 5')
    expect(give.ok).toBe(true)

    // Hermetic setup: stand within reach of chest A before opening.
    const tp = await execCmd('/tp Krutoy242 8000.5 5 8004.5')
    expect(tp.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 500))
    const use: any = await sendCommand({ cmd: 'use', x: 8002, y: 4, z: 8000 })
    expect(use?.result ?? use?.ok).toBeTruthy()
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const s: any = await state()
      if (String(s.screen).includes('Chest')) break
      if (i === 9) throw new Error('chest GUI did not open')
    }
    const snap = async (): Promise<number> => {
      const w: any = await sendCommand({ cmd: 'winv' })
      return (w.slots ?? []).slice(0, 27)
        .reduce((n: number, s: any) => n + (s?.id === 'minecraft:dirt' ? s.n : 0), 0)
    }
    const chestDirtBefore = await snap()
    // Honest drag-and-drop via the virtual cursor (no direct windowClick):
    // vanilla ContainerChest layout on the 427x240 scaled GUI, chest GUI
    // 176x166 centered -> guiLeft 125, guiTop 37; every slot is an 18px
    // cell with an 8px margin, click at cell center (+8,+8).
    const SW = 427
    const SH = 240
    const gl = Math.floor((SW - 176) / 2)
    const gt = Math.floor((SH - 166) / 2)
    const center = (slot: number): [number, number] => {
      if (slot < 27) return [gl + 8 + 18 * (slot % 9) + 8, gt + 18 + 18 * Math.floor(slot / 9) + 8]
      if (slot < 54) { const i = slot - 27; return [gl + 8 + 18 * (i % 9) + 8, gt + 84 + 18 * Math.floor(i / 9) + 8] }
      const i = slot - 54; return [gl + 8 + 18 * i + 8, gt + 142 + 8]
    }
    const at = async (slot: number): Promise<void> => {
      const [x, y] = center(slot)
      await sendCommand({ cmd: 'cursor', x, y })
      await sendCommand({ cmd: 'cursorhover', ticks: 12 })
      await new Promise((r) => setTimeout(r, 300))
      const under: any = await sendCommand({ cmd: 'cursorslot' })
      if (under?.slot !== slot) throw new Error(`hover missed slot ${slot} (got ${under?.slot})`)
    }
    const clickAt = async (slot: number): Promise<void> => {
      await at(slot)
      await sendCommand({ cmd: 'cursorclick', button: 0 })
      await new Promise((r) => setTimeout(r, 600))
    }
    const win: any = await sendCommand({ cmd: 'winv' })
    const slots: any[] = win.slots ?? []
    // Chest container: 0-26 chest, 27-53 player main, 54-62 hotbar.
    // Pick up each player-side dirt stack, drop it on the first empty chest slot.
    for (let w = 27; w <= 62; w++) {
      if (slots[w]?.id === 'minecraft:dirt') {
        await clickAt(w)
        const now: any = await sendCommand({ cmd: 'winv' })
        const cur: any[] = now.slots ?? []
        const t = cur.slice(0, 27).findIndex((s: any) => s == null)
        if (t < 0) throw new Error('chest is full')
        await clickAt(t)
      }
    }
    const chestDirtAfter = await snap()
    expect(chestDirtAfter).toBeGreaterThan(chestDirtBefore)
    await sendCommand({ cmd: 'close' })
  }, 60000)
})
