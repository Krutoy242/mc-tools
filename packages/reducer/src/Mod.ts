import type { InstalledAddon } from './minecraftinstance.js'
import { rename, stat } from 'node:fs/promises'

import { resolve } from 'node:path'

export enum DependencyLevel {
  All,
  Embed,
  Optional,
  Required,
  Tool
}

export type ModdedAddon = InstalledAddon & { mod?: Mod }

export type ModEvent
  = | { type: 'enable',  mod: Mod }
    | { type: 'disable', mod: Mod }
    | { type: 'error',   mod: Mod, error: string }
    | { type: 'refresh', mod: Mod }

export type ModEventListener = (event: ModEvent) => void

export interface ModSwitchFailure {
  mod  : Mod
  error: string
}

export interface ModSwitchResult {
  ok    : number
  failed: ModSwitchFailure[]
}

// Clear extensions and postfixes from mod file name
export function purify(fileName?: string) {
  return fileName?.replace(/(?:-patched)?(?:\.jar|(?:\.jar)?(?:\.disabled)+)$/gm, '')
}

export class Mod {
  static modsPath : string
  static listener?: ModEventListener

  public isDisabled  : boolean
  public dependencies: Mod[] = []
  public dependents = new Set<Mod>()

  public get disabled() { return this.isDisabled }
  public get enabled() { return !this.isDisabled }

  constructor(public fileName: string, public addon: ModdedAddon | undefined) {
    this.isDisabled = !fileName.endsWith('.jar')
  }

  public addDependency(deps: Mod | Mod[]) {
    this.dependencies.push(...[deps].flat())
    this.dependencies.forEach(d => d.dependents.add(this))
  }

  public getDependentsCount(antiloop = new Set<Mod>()): number {
    if (antiloop.has(this)) return 0
    antiloop.add(this)

    return this.dependents.size
      + [...this.dependents].reduce((sum, current) => sum + current.getDependentsCount(antiloop), 0)
  }

  getDepsLevel(antiloop = new Set<Mod>()): number {
    if (antiloop.has(this)) return 0
    antiloop.add(this)
    return this.dependencies
      .map(r => 1 + r.getDepsLevel(antiloop))
      .reduce((sum, current) => sum + current, 0)
  }

  static async disable(mods: Iterable<Mod>): Promise<ModSwitchResult> {
    return Mod.switchMany(mods, true)
  }

  static async enable(mods: Iterable<Mod>): Promise<ModSwitchResult> {
    return Mod.switchMany(mods, false)
  }

  private static async switchMany(mods: Iterable<Mod>, toDisable: boolean): Promise<ModSwitchResult> {
    const antiloop = new Set<Mod>()
    let ok = 0
    const failed: ModSwitchFailure[] = []
    for (const m of mods) {
      await (toDisable ? m.disable(antiloop) : m.enable(antiloop))
      const success = toDisable ? m.disabled : m.enabled
      if (success) ok++
      else failed.push({ mod: m, error: 'dependency cycle or already processed' })
    }
    return { ok, failed }
  }

  private async disable(antiloop = new Set<Mod>()): Promise<{ ok: boolean, error?: string }> {
    if (antiloop.has(this)) return { ok: false }
    antiloop.add(this)
    const r = await this.switch(true)
    if (r.ok) {
      for (const d of this.dependents)
        await d.disable(antiloop)
    }
    return r
  }

  private async enable(antiloop = new Set<Mod>()): Promise<{ ok: boolean, error?: string }> {
    if (antiloop.has(this)) return { ok: false }
    antiloop.add(this)
    const r = await this.switch(false)
    if (r.ok) {
      for (const d of this.dependencies)
        await d.enable(antiloop)
    }
    return r
  }

  private async switch(toDisable: boolean, retried = false): Promise<{ ok: boolean, error?: string }> {
    if (this.isDisabled === toDisable) return { ok: true }
    const newFileName = toDisable
      ? `${this.fileName}.disabled`
      : this.fileName.replace(/\.disabled/g, '')

    try {
      await rename(
        resolve(Mod.modsPath, this.fileName),
        resolve(Mod.modsPath, newFileName)
      )
      this.fileName = newFileName
      this.isDisabled = toDisable
      Mod.listener?.({ type: toDisable ? 'disable' : 'enable', mod: this })
      return { ok: true }
    }
    catch (err: unknown) {
      const e = err as { message?: string, code?: string }
      // If the source file vanished or got renamed externally, sync our state
      // from disk and retry once.
      if (!retried && (e?.code === 'ENOENT')) {
        const refreshed = await this.refresh()
        if (refreshed && this.isDisabled !== toDisable) {
          return this.switch(toDisable, true)
        }
      }
      const error = e?.message ?? 'unknown error'
      Mod.listener?.({ type: 'error', mod: this, error })
      return { ok: false, error }
    }
  }

  /**
   * Re-stat the file on disk and update `fileName` / `isDisabled` to match
   * reality. Useful if the user renamed/deleted a mod outside the program
   * while it was running.
   *
   * Returns true when the file was found (under any expected name), false
   * when it has gone missing entirely.
   */
  public async refresh(): Promise<boolean> {
    const base = this.fileNameNoExt
    const candidates = [this.fileName, `${base}.jar`, `${base}.jar.disabled`]
    const seen = new Set<string>()
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      try {
        await stat(resolve(Mod.modsPath, candidate))
        const wasDisabled = this.isDisabled
        this.fileName = candidate
        this.isDisabled = !candidate.endsWith('.jar')
        if (wasDisabled !== this.isDisabled) {
          Mod.listener?.({ type: 'refresh', mod: this })
        }
        return true
      }
      catch { /* try next candidate */ }
    }
    Mod.listener?.({ type: 'error', mod: this, error: 'file missing on disk' })
    return false
  }

  public get fileNameNoExt() {
    return this.fileName.replace(/\.jar(?:\.disabled)?$/, '')
  }

  public get displayRaw() {
    return `${this.addon?.name ?? ''} ◂${this.fileNameNoExt}▸`.trim()
  }

  public get displayName(): string {
    return this.addon?.name?.trim() || this.fileNameNoExt
  }
}
