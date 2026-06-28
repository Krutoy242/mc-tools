import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { guardSession } from '../src/core/session.js'
import { Mod } from '../src/Mod.js'
import { clearSession, detectDrift, hasDrift, snapshotMods, writeSession } from '../src/session/lock.js'

// Synthetic, unique mc-path keys so this file's session state can't collide with
// other test files (lock funcs only hash the string; they never stat it).
const KEY = `${__dirname}#session-test`

function mod(name: string, disabled = false): Mod {
  return new Mod(disabled ? `${name}.jar.disabled` : `${name}.jar`, undefined)
}

beforeEach(() => clearSession(KEY))
afterEach(() => clearSession(KEY))

describe('detectDrift', () => {
  it('treats enable/disable toggles as NOT drift', () => {
    const before = snapshotMods([mod('a'), mod('b')])
    const now = [mod('a', true), mod('b')] // a got disabled — same identity
    expect(hasDrift(detectDrift(before, now))).toBe(false)
  })

  it('flags a renamed jar as drift', () => {
    const before = snapshotMods([mod('a'), mod('b')])
    const now = [mod('a'), mod('renamed')]
    const drift = detectDrift(before, now)
    expect(hasDrift(drift)).toBe(true)
    expect(drift.missing).toContain('b')
    expect(drift.added).toContain('renamed')
  })
})

describe('guardSession', () => {
  const baseline = [mod('a'), mod('b'), mod('c')]

  it('is fresh with no prior session', () => {
    expect(guardSession(KEY, baseline, {}).mode).toBe('fresh')
  })

  it('reports interruption when a non-idle session exists and no flag is given', () => {
    writeSession(KEY, { phase: 'bisecting', snapshot: snapshotMods(baseline) })
    expect(guardSession(KEY, baseline, {}).mode).toBe('interrupted')
  })

  it('resumes when --continue and the environment is unchanged (file freed)', () => {
    writeSession(KEY, { phase: 'bisecting', snapshot: snapshotMods(baseline) })
    // user freed the locked jar: same identities, maybe toggled state
    const freed = [mod('a', true), mod('b'), mod('c')]
    expect(guardSession(KEY, freed, { continue: true }).mode).toBe('resume')
  })

  it('refuses to resume when a different jar was renamed (environment changed)', () => {
    writeSession(KEY, { phase: 'bisecting', snapshot: snapshotMods(baseline) })
    const drifted = [mod('a'), mod('b'), mod('c-renamed')]
    const g = guardSession(KEY, drifted, { continue: true })
    expect(g.mode).toBe('drift')
  })

  it('--new discards the interrupted session', () => {
    writeSession(KEY, { phase: 'bisecting', snapshot: snapshotMods(baseline) })
    expect(guardSession(KEY, baseline, { new: true }).mode).toBe('fresh')
  })
})
