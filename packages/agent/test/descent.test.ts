import { describe, expect, test } from 'vitest'

const { execCmd, sendCommand, state } = await import('../src/index.ts')

// Smooth jetpack descent with a local 100ms decider.
//
// Loop: `pnpm --filter @mctools/agent test-descent` from mc-tools/.
// Repeatable: pre-checks the suit, ascends ~45 blocks on jetpack thrust,
// faces down, then lands itself. Watch the y/my/thrust log.
//
// Protocol with the decider: the test tells it what it wants (a target
// sink rate for the current altitude); the decider answers thrust ON/OFF
// on Space (rawkey 57). ~10 decisions/sec at 20 TPS.
//
// Why pulsing works: IC2 JetpackLogic.useJetpack zeroes fallDistance on
// EVERY thrust tick, so regular pulses make the landing damage-free no
// matter the total drop; the decider only shapes the sink rate.
// Non-hover suit: sneak does nothing, Space is the only control.
//
// Deaths are routine here, so the test revives itself: Respawn button,
// `tmg_restore <player> latest` (TombManyGraves backups are on), gear
// check, teleport back to the apex, resume. Max 2 revives, then FAIL.
//
// Prerequisites (checked, fail fast with a message):
// - game live on socket, peaceful throwaway world
// - quantum jetpack chestplate EQUIPPED (armor slot 6) and CHARGED

const SPACE = 57
const DECIDE_MS = 100
const MAX_REVIVES = 2

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Target sink (blocks/tick) by air gap. my is blocks/tick:
// +0.51 sustained climb, -0.078 standing rest.
const vstar = (dy: number): number | null => {
  if (dy > 15) return -0.15 // cruise down ~3 b/s
  if (dy > 4) return -0.06 // approach ~1.2 b/s
  if (dy > 1.2) return -0.025 // flare ~0.5 b/s
  return null // touchdown: cut thrust
}

describe.skipIf(!LIVE)('jetpack descent', () => {
  test('decider lands softly, no fall damage (self-reviving)', async () => {
    let thrust = false
    const setThrust = async (on: boolean): Promise<void> => {
      if (on === thrust) return
      thrust = on
      await sendCommand({ cmd: 'rawkey', code: SPACE, down: on })
    }
    const log: string[] = []
    const say = (m: string): void => { log.push(m); console.log(m) }
    // The socket answers long before the just-joined world settles
    // (spawn chunks on a 441-mod pack wedge the client thread past the
    // 5s Mc.sync budget). Poll until state() succeeds, then start.
    for (let i = 0; i < 36; i++) {
      try {
        await state()
        break
      }
      catch {
        if (i === 35) throw new Error('world never settled (state() keeps timing out)')
        await sleep(5000)
      }
    }
    const chestOn = async (): Promise<boolean> => {
      const w: any = await sendCommand({ cmd: 'winv' })
      return String(w.slots?.[6]?.id ?? '').includes('chestplate')
    }

    const s0: any = await state()
    const yaw0 = s0.pos.yaw as number
    // Suit recovery (deaths leave it in a grave): restore the latest
    // backup, or pull it from the inventory onto slot 6. Only the manual
    // equip error remains if both fail.
    const findSuitWorn = async (): Promise<boolean> => await chestOn()
    if (!await findSuitWorn()) {
      say('suit not worn — trying tmg_restore latest')
      try {
        const r: any = await execCmd('/tmg_restore Krutoy242 latest')
        say(`restore: ${String(r.output ?? r).slice(0, 80)}`)
      }
      catch (e: any) {
        say(`restore n/a: ${String(e?.message ?? e).slice(0, 80)}`)
      }
    }

    // Slot addressing: hardcoded player-container geometry (176x166 GUI
    // on the 427x240 scaled screen: gl=125, gt=37; armor 5-8, main 9-35,
    // hotbar 36-44; 18px cells, click at center). Valid ONLY at 854x480
    // window + auto GUI scale — the harness keeps that size (see slotxy,
    // the size-proof endpoint, live after the next reboot).
    // No cursorslot verification: that endpoint reflects a dev-named
    // method and errs in prod (fixed for the next reboot). Every drag is
    // verified BEHAVIORALLY via winv deltas (slot emptied/filled).
    const pcenter = (slot: number): [number, number] => {
      if (slot >= 5 && slot <= 8) return [141, 53 + 18 * (slot - 5)]
      if (slot < 36) { const i = slot - 9; return [141 + 18 * (i % 9), 129 + 18 * Math.floor(i / 9)] }
      return [141 + 18 * (slot - 36), 187]
    }
    const pat = async (slot: number): Promise<void> => {
      const [x, y] = pcenter(slot)
      await sendCommand({ cmd: 'cursor', x, y })
      await sendCommand({ cmd: 'cursorhover', ticks: 12 })
      await sleep(400)
    }
    const dragDrop = async (from: number, to: number): Promise<void> => {
      await pat(from)
      await sendCommand({ cmd: 'cursorclick', button: 0 })
      await sleep(700)
      let w: any = await sendCommand({ cmd: 'winv' })
      if ((w.slots ?? [])[from] != null) throw new Error(`pickup failed at slot ${from}`)
      await pat(to)
      await sendCommand({ cmd: 'cursorclick', button: 0 })
      await sleep(700)
      w = await sendCommand({ cmd: 'winv' })
      if ((w.slots ?? [])[to] == null) throw new Error(`place failed at slot ${to}`)
    }
    const openInv = async (): Promise<void> => {
      await sendCommand({ cmd: 'rawkey', code: 18, down: true })
      await sleep(200)
      await sendCommand({ cmd: 'rawkey', code: 18, down: false })
      for (let i = 0; i < 10; i++) {
        await sleep(500)
        const s: any = await state()
        if (String(s.screen).includes('Inventory')) return
        if (i === 9) throw new Error('inventory did not open')
      }
    }
    // While a GUI is open vanilla never turns the head, so every
    // steered mouse event piles into the delta backlog — closing the GUI
    // fires it all at once and the head snaps (usually up). Re-aim down
    // after every close in this flow; yaw never changes by itself.
    const faceDown = async (): Promise<void> => {
      await sendCommand({ cmd: 'look', yaw: yaw0, pitch: -80 })
    }
    const findSuit = async (): Promise<number> => {
      const w: any = await sendCommand({ cmd: 'winv' })
      const slots: any[] = w.slots ?? []
      for (let s = 9; s < slots.length; s++) {
        if (String(slots[s]?.id ?? '').includes('chestplate')) return s
      }
      return -1
    }
    say('CHARGE: unequip, drop, energize, re-equip')
    await openInv()
    {
      const w: any = await sendCommand({ cmd: 'winv' })
      const slots: any[] = w.slots ?? []
      const t = slots.slice(9, 36).findIndex((s: any) => s == null)
      if (t < 0) throw new Error('no empty main-inventory slot for the suit')
      await dragDrop(6, 9 + t) // armor -> main inventory
    }
    await sendCommand({ cmd: 'close' })
    await sleep(500)
    await faceDown() // backlog snap after GUI steering
    {
      // Move to an empty hotbar slot, select it, Q-drop at our feet.
      const w: any = await sendCommand({ cmd: 'winv' })
      const slots: any[] = w.slots ?? []
      const from = slots.findIndex((s: any, i: number) => i >= 9 && i < 36 && String(s?.id ?? '').includes('chestplate'))
      if (from < 0) throw new Error('suit lost after unequip?!')
      const hb = slots.findIndex((s: any, i: number) => i >= 36 && i < 45 && s == null)
      if (hb < 0) throw new Error('no empty hotbar slot')
      await openInv()
      await dragDrop(from, hb)
      await sendCommand({ cmd: 'close' })
      await sleep(500)
      await faceDown() // backlog snap after GUI steering
      await sendCommand({ cmd: 'rawkey', code: 2 + (hb - 36), down: true })
      await sleep(200)
      await sendCommand({ cmd: 'rawkey', code: 2 + (hb - 36), down: false })
      await sleep(500)
      await sendCommand({ cmd: 'rawkey', code: 16, down: true }) // Q-drop
      await sleep(200)
      await sendCommand({ cmd: 'rawkey', code: 16, down: false })
      await sleep(1000)
    }
    {
      const ch: any = await execCmd('/entitydata @e[type=Item,r=4] {Item:{tag:{EnergizedEnergy:40000000}}}')
      if (!ch.ok) throw new Error(`charge merge failed: ${ch.output}`)
      say(`CHARGE merged: ${String(ch.output).slice(0, 100)}`)
    }
    await sleep(3500) // pickup delay + walk-in (dropped at our feet)
    {
      const at = await findSuit()
      if (at < 0) throw new Error('charged suit was not picked up')
      if (at !== 6) {
        // Drag it onto the chest armor slot.
        await openInv()
        await dragDrop(at, 6)
        await sendCommand({ cmd: 'close' })
        await sleep(500)
        await faceDown() // backlog snap after GUI steering
      }
      if (!await chestOn()) throw new Error('suit not back on slot 6 after charge')
    }
    say('CHARGE ok: suit full (40M) and worn')

    const sChg: any = await state()
    const hp0 = sChg.pos.health as number

    // --- Pre-check 1: thrust exists. Full ON from the ground, must climb.
    say(`PRE y=${(s0.pos.y as number).toFixed(1)} hp=${hp0}`)
    await setThrust(true)
    await sleep(2500)
    const sPre: any = await state()
    if ((sPre.pos.y as number) - (s0.pos.y as number) < 5) {
      await setThrust(false)
      throw new Error('no thrust in 2.5s — charge the suit (EnergizedEnergy) and retry')
    }
    // Hover guard: hoverMode+no keys sinks at exactly ≈-0.07 (thrust
    // pushes +0.2/tick, clamp cuts rise at 0) — indistinguishable from a
    // gentle sink except it never lands. Detect: thrust OFF 3s while
    // airborne with |my| < 0.15. Fix like a player would: Jump+M toggles
    // hover (10-tick cooldown, so one 300ms press = one toggle), then
    // re-verify the fall. Used at the apex and whenever the descent hangs.
    const hoverClear = async (): Promise<boolean> => {
      for (let i = 0; i < 6; i++) {
        await sleep(500)
        const h: any = await Promise.all([state(), sendCommand({ cmd: 'trace' })]).then(
          ([s, t]: any[]) => ({ dy: t.dy as number, my: t.my as number }))
        if (h.dy <= 1.5 || h.my < -0.4) return true // falling or landed
      }
      return false
    }
    const hoverOff = async (where: string): Promise<void> => {
      await setThrust(false)
      if (await hoverClear()) return
      say(`HOVER? at ${where} — toggling with Jump+M`)
      await sendCommand({ cmd: 'rawkey', code: SPACE, down: true })
      await sendCommand({ cmd: 'rawkey', code: 50, down: true }) // IC2 mode switch (M)
      await sleep(300)
      await sendCommand({ cmd: 'rawkey', code: 50, down: false })
      await sendCommand({ cmd: 'rawkey', code: SPACE, down: false })
      await sleep(1000) // past the 10-tick toggle cooldown
      if (!await hoverClear()) throw new Error('hover stuck ON — toggle it off by hand (Jump+M)')
      say('HOVER off, falling again')
    }
    await hoverOff('pre')
    say('PRE ok: thrust proven, hover off')

    // --- Ascent: full thrust until +H blocks (H from DESCENT_HEIGHT,
    // default 45). Low phases first (+10): even total thrust loss from
    // +10 costs a few hearts, not a grave.
    const H = Number(process.env.DESCENT_HEIGHT ?? 45)
    const yBase = (s0.pos.y as number)
    say(`ASCENT target +${H}`)
    await setThrust(true)
    const tAsc = Date.now()
    for (;;) {
      await sleep(250) // tight poll: 12 b/s climb overshoots badly on 1s polls
      const s: any = await state()
      if ((s.pos.y as number) - yBase >= H) break
      if (Date.now() - tAsc > 30000) throw new Error('ascent stalled — suit died mid-climb')
    }
    const apex: any = await state()
    const ax = apex.pos.x as number
    const ay = apex.pos.y as number
    const az = apex.pos.z as number
    // Face down for the whole descent leg, then prove hover is off:
    // a hang here would waste the whole run orbitalside.
    await sendCommand({ cmd: 'look', yaw: yaw0, pitch: -80 })
    await hoverOff('apex')
    say(`APEX y=${ay.toFixed(1)} yaw=${yaw0.toFixed(0)} — decider takes over, facing down`)

    let revives = 0
    const recover = async (): Promise<void> => {
      revives++
      if (revives > MAX_REVIVES) throw new Error(`died ${revives}x — giving up\n${log.join('\n')}`)
      say(`REVIVE #${revives}: respawning`)
      await setThrust(false)
      await sendCommand({ cmd: 'guibtn', label: 'Respawn' })
      for (let i = 0; i < 20; i++) {
        await sleep(500)
        const s: any = await state()
        if (s.screen === 'none') break
        if (i === 19) throw new Error('respawn did not return to the world')
      }
      const r: any = await execCmd('/tmg_restore Krutoy242 latest')
      if (!r.ok || !String(r.output ?? '').includes('restored')) {
        throw new Error(`tmg_restore failed: ${r.output}`)
      }
      if (!await chestOn()) throw new Error('restore did not bring the chestplate back')
      const tp: any = await execCmd(`/tp Krutoy242 ${ax.toFixed(1)} ${ay.toFixed(1)} ${az.toFixed(1)}`)
      if (!tp.ok) throw new Error(`tp back to apex failed: ${tp.output}`)
      await sleep(500)
      // Respawn resets the head — face down again for the descent leg.
      const rs: any = await state()
      await sendCommand({ cmd: 'look', yaw: rs.pos.yaw, pitch: -80 })
      say(`REVIVE #${revives} ok: gear restored, back at apex`)
    }

    // --- Descent: bang-bang on sink rate, 100ms decisions.
    const t0 = Date.now()
    let flips = 0
    let n = 0
    let badOnMs = 0
    let lastTick = Date.now()
    let hangMs = 0
    let lastHang = Date.now()
    for (;;) {
      const tick = Date.now()
      const [s, t]: any[] = await Promise.all([state(), sendCommand({ cmd: 'trace' })])
      const y = s.pos.y as number
      const my = t.my as number
      const dy = t.dy as number
      const hp = s.pos.health as number
      const yaw = s.pos.yaw as number
      const pitch = s.pos.pitch as number
      if (String(s.screen ?? '').includes('GameOver') || hp <= 0) {
        say(`DIED y=${y.toFixed(1)} — recovering`)
        await recover()
        continue
      }
      const v = vstar(dy)
      if (v === null) break // touchdown zone
      let want: any = thrust
      if (my < -0.3) want = true // emergency: falling fast, thrust now
      else if (my < v - 0.02) want = true
      else if (my > v + 0.02) want = false
      if (want !== thrust) flips++
      await setThrust(want)
      // Hang watch: thrust OFF for a long while, still airborne, speed
      // near zero = hover crept back on. Fix it inline, keep descending.
      if (!thrust) {
        hangMs += tick - lastHang
        if (hangMs > 8000 && dy > 3) {
          say(`HANG y=${y.toFixed(1)} — re-checking hover`)
          await hoverOff('descent')
          hangMs = 0
        }
      } else {
        hangMs = 0
      }
      lastHang = tick
      // Watchdog: full thrust that never bites means a dead suit, not a
      // control problem — the coming death + revive will handle it, but
      // say so while there is still time to watch.
      if (thrust && my < -0.6) badOnMs += tick - lastTick
      else badOnMs = 0
      lastTick = tick
      if (n % 5 === 0 || badOnMs > 2000) {
        say(`t=${((tick - t0) / 1000).toFixed(1)}s y=${y.toFixed(1)} my=${my.toFixed(2)} dy=${dy} v*=${v} yaw=${yaw.toFixed(0)} pitch=${pitch.toFixed(0)} thrust=${thrust ? 'ON' : 'off'}${badOnMs > 2000 ? ' THRUST INEFFECTIVE?' : ''}`)
      }
      n++
      if (Date.now() - t0 > 240000) throw new Error('descent timed out (240s)')
      const spent = Date.now() - tick
      if (spent < DECIDE_MS) await sleep(DECIDE_MS - spent)
    }

    // --- Touchdown: cut thrust, wait for rest, verify.
    await setThrust(false)
    say('TOUCHDOWN — thrust cut, settling')
    await sleep(1500)
    const s1: any = await state()
    const hp1 = s1.pos.health as number
    say(`DOWN y=${(s1.pos.y as number).toFixed(1)} yaw=${(s1.pos.yaw as number).toFixed(0)} pitch=${(s1.pos.pitch as number).toFixed(0)} hp=${hp0}->${hp1} flips=${flips} revives=${revives}`)
    expect(String(s1.screen ?? '').includes('GameOver')).toBe(false)
    expect(hp1).toBeGreaterThanOrEqual(hp0)
  }, 420000)
})
