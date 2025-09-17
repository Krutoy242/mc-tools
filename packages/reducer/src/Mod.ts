import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'

import chalk from 'chalk'
import { Memoize } from 'typescript-memoize'

import type { InstalledAddon } from './minecraftinstance'

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
  return fileName?.replace(/(?:-patched)?(?:\.jar|(?:\.jar)?(?:\.disabled)+)$/gm, '')
}

export class Mod {
  static modsPath: string

  // eslint-disable-next-line style/no-multi-spaces
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

  @Memoize(() => '')
  getDepsLevel(antiloop = new Set<Mod>()): number {
    if (antiloop.has(this)) return 0
    antiloop.add(this)
    return this.dependencies
      .map(r => 1 + r.getDepsLevel(antiloop))
      .reduce((sum, current) => sum + current, 0)
  }

  static async disable(mods: Iterable<Mod>, silent = false): Promise<number> {
    return Mod.switch(mods, true, silent)
  }

  static async enable(mods: Iterable<Mod>, silent = false): Promise<number> {
    return Mod.switch(mods, false, silent)
  }

  private static async switch(mods: Iterable<Mod>, toDisable: boolean, silent: boolean): Promise<number> {
    const antiloop = new Set<Mod>()
    let counter = 0
    for (const m of mods) {
      counter += +(toDisable
        ? await m.disable(antiloop, silent)
        : await m.enable(antiloop, silent))
    }
    return counter
  }

  private async disable(antiloop = new Set<Mod>(), silent: boolean): Promise<boolean> {
    if (antiloop.has(this)) return false
    antiloop.add(this)
    if (await this.switch(true, silent)) {
      for (const d of this.dependents)
        await d.disable(antiloop, silent)
    }
    return true
  }

  private async enable(antiloop = new Set<Mod>(), silent: boolean): Promise<boolean> {
    if (antiloop.has(this)) return false
    antiloop.add(this)
    if (await this.switch(false, silent)) {
      for (const d of this.dependencies)
        await d.enable(antiloop, silent)
    }
    return true
  }

  private async switch(toDisable: boolean, silent: boolean) {
    if (this.isDisabled === toDisable) return true
    const newFileName = toDisable
      ? `${this.fileName}.disabled`
      : this.fileName.replace(/\.disabled/g, '')

    if (!silent) {
      process.stdout.write(
        `${toDisable ? chalk.bgRgb(60, 30, 30)('disable') : chalk.bgRgb(30, 60, 30)('enable')} ${chalk.gray(this.fileNameNoExt)}`
      )
    }

    try {
      await rename(
        resolve(Mod.modsPath, this.fileName),
        resolve(Mod.modsPath, newFileName)
      )
      if (!silent) process.stdout.write('\n')
      this.fileName = newFileName
      this.isDisabled = toDisable
    }
    catch (e: any) {
      if (!silent) console.error(` ${' '.repeat(Math.max(1, 49 - this.fileNameNoExt.length))}${chalk.red(e?.message)}`)
      return false
    }
    return true
  }

  public get fileNameNoExt() {
    return this.fileName.replace(/\.jar(?:\.disabled)?$/, '')
  }

  static displayify(text: string) {
    return text.replace(/(◂.*)/, chalk.gray('$1'))
  }

  public get display() {
    return Mod.displayify(this.displayRaw)
  }

  public get displayRaw() {
    return `${this.addon?.name ?? ''} ◂${this.fileNameNoExt}▸`.trim()
  }
}
