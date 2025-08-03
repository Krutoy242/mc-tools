import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'

import chalk from 'chalk'
import _ from 'lodash'
import terminal_kit from 'terminal-kit'
import { Memoize } from 'typescript-memoize'

import type { InstalledAddon } from './minecraftinstance'

import { style } from './binary'

export enum DependencyLevel {
  All,
  Emmbed,
  Optional,
  Required,
  Tool
}

export type ModdedAddon = InstalledAddon & { mod?: Mod }

// Clear extensions and postfixes from mod file name
export function purify(fileName?: string) {
  return fileName?.replace(/(-patched)?(\.jar|(\.jar)?(\.disabled)+)$/gm, '')
}

const { terminal: T } = terminal_kit

export function getStatusText(status: keyof typeof style, isDisabled: boolean) {
  return style[status](isDisabled ? '░' : '▒')
}

export class Mod {
  static modsPath: string
  
  private isDisabled: boolean
  public dependencies: Mod[] = []
  public dependents = new Set<Mod>()

  public status: keyof typeof style = 'suspective'

  public get statusText(): string {
    return getStatusText(this.status, this.isDisabled)
  }

  public get disabled() { return this.isDisabled }
  public get enabled() { return !this.isDisabled }

  constructor(public fileName: string, public addon: ModdedAddon | undefined) {
    this.isDisabled = !fileName.endsWith('.jar')
  }

  public addDependency(deps: Mod | Mod[]) {
    this.dependencies.push(...[deps].flat())
    this.dependencies.forEach(d => d.dependents.add(this))
  }

  @Memoize(() => '')
  getDepsLevel(antiloop = new Set<Mod>()) {
    if (antiloop.has(this)) return 0
    antiloop.add(this)
    return _.sum(this.dependencies.map(r => 1 + r.getDepsLevel(antiloop)))
  }

  async disable(antiloop = new Set<Mod>()) {
    if (antiloop.has(this)) return
    antiloop.add(this)
    await this.toggle(true)
    for (const d of this.dependents)
      await d.disable(antiloop)
  }

  async enable(antiloop = new Set<Mod>()) {
    if (antiloop.has(this)) return
    antiloop.add(this)
    await this.toggle(false)
    for (const d of this.dependencies)
      await d.enable(antiloop)
  }

  private async toggle(toDisable: boolean) {
    if (this.isDisabled === toDisable) return false
    const newFileName = toDisable
      ? `${this.fileName}.disabled`
      : this.fileName.replace(/\.disabled/g, '')
    T(
      `${toDisable ? chalk.bgRgb(60, 30, 30)('disable') : chalk.bgRgb(30, 60, 30)('enable')} `,
      chalk.gray(this.fileName),
      '\n'
    )
    try {
      await rename(
        resolve(Mod.modsPath, this.fileName),
        resolve(Mod.modsPath, newFileName)
      )
    }
    catch (e: any) {
      T(chalk.red.dim.inverse(' ERROR '), 'Unable to rename\n', e?.message, '\n')
    }
    this.fileName = newFileName
    this.isDisabled = toDisable
    return true
  }
}
