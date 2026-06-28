import type { Status } from '../binarySearch.js'
import type { Mod } from '../Mod.js'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import { hashName } from '../theme.js'

const VERSION = 1

/** Identity + on-disk toggle state of one mod at a checkpoint. */
export interface ModSnapshotEntry {
  /** `fileNameNoExt` — stable across enable/disable, changes on rename. */
  base    : string
  disabled: boolean
}

export interface SessionPlan {
  toEnable : string[]
  toDisable: string[]
}

export interface BinarySessionState {
  configPath: string
  /** Status keyed by mod base name. */
  statuses  : Record<string, Status>
  iterations: { enabled: number, disabled: number, bugPersists?: boolean }[]
}

export interface SessionState {
  version  : number
  createdAt: number
  updatedAt: number
  /**
   * `idle` means the last operation finished cleanly. Any other value found at
   * startup means the process was killed mid-operation.
   */
  phase    : 'idle' | 'applying' | 'restarting' | 'awaiting' | 'bisecting'
  snapshot : ModSnapshotEntry[]
  plan?    : SessionPlan
  binary?  : BinarySessionState
}

function sessionPath(mcPath: string): string {
  const hash = hashName(mcPath).toString(16).padStart(8, '0')
  return join(tmpdir(), 'mctools-reducer', hash, 'session.json')
}

export function snapshotMods(mods: Mod[]): ModSnapshotEntry[] {
  return mods
    .map(m => ({ base: m.fileNameNoExt, disabled: m.disabled }))
    .sort((a, b) => a.base.localeCompare(b.base))
}

export function readSession(mcPath: string): SessionState | null {
  try {
    const raw = JSON.parse(readFileSync(sessionPath(mcPath), 'utf8')) as SessionState
    return raw?.version === VERSION ? raw : null
  }
  catch {
    return null
  }
}

export function writeSession(mcPath: string, state: Omit<SessionState, 'version' | 'createdAt' | 'updatedAt'> & Partial<Pick<SessionState, 'createdAt'>>): void {
  const path = sessionPath(mcPath)
  mkdirSync(dirname(path), { recursive: true })
  const now = Date.now()
  const full: SessionState = {
    version  : VERSION,
    createdAt: state.createdAt ?? now,
    updatedAt: now,
    phase    : state.phase,
    snapshot : state.snapshot,
    plan     : state.plan,
    binary   : state.binary,
  }
  writeFileSync(path, JSON.stringify(full, null, 2))
}

export function clearSession(mcPath: string): void {
  try {
    rmSync(sessionPath(mcPath), { force: true })
  }
  catch { /* already gone */ }
}

export interface Drift {
  /** Mod identities present at checkpoint but missing now (renamed/removed). */
  missing: string[]
  /** Mod identities present now but absent at checkpoint (added/renamed-in). */
  added  : string[]
}

/**
 * Compare a saved snapshot against the current mods by *identity* (base name).
 * Enable/disable toggles are NOT drift — they are the expected effect of our
 * own operations. A changed identity (a jar renamed externally) is drift and
 * means the environment shifted under us, so resuming is unsafe.
 */
export function detectDrift(snapshot: ModSnapshotEntry[], mods: Mod[]): Drift {
  const prev = new Set(snapshot.map(s => s.base))
  const cur = new Set(mods.map(m => m.fileNameNoExt))
  const missing = [...prev].filter(b => !cur.has(b))
  const added = [...cur].filter(b => !prev.has(b))
  return { missing, added }
}

export function hasDrift(d: Drift): boolean {
  return d.missing.length > 0 || d.added.length > 0
}
