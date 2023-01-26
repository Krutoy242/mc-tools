import { rename } from 'fs/promises'
import { resolve } from 'path'
import _ from 'lodash'
import chalk from 'chalk'
import levenshtein from 'fast-levenshtein'
import { Memoize } from 'typescript-memoize'
import terminal_kit from 'terminal-kit'
import { style } from './binary'
import type { InstalledAddon } from './minecraftinstance'

export type ModdedAddon = InstalledAddon & { mod?: Mod }

export function purify(fileName?: string) {
  return fileName?.replace(/(\-patched)?(\.jar|(\.jar)?(\.disabled)+)$/gm, '')
}

const { terminal: T } = terminal_kit

export const forks = {
  223794: [570458], // Applied
  238222: [557549], // HEI
  268387: [398267], // Extended Crafting
  243121: [417392], // Quark
  434516: [261348], // Avaritia
}

export function getStatusText(status: keyof typeof style, isDisabled: boolean) {
  return style[status](isDisabled ? '░' : '▒')
}

export class Mod {
  static modsPath: string
  static addons: ModdedAddon[]

  static getAddonById(addonId: number): ModdedAddon | undefined {
    return Mod.addons.find(o =>
      o.addonID === addonId // Exact match addon
      || forks[addonId]?.includes(o.addonID) // Addon is fork
    )
  }

  private isDisabled: boolean
  public pureName?: string
  public addon?: ModdedAddon
  public dependents = new Set<Mod>()

  public status: keyof typeof style = 'suspective'

  public get statusText(): string {
    return getStatusText(this.status, this.isDisabled)
  }

  public get disabled() { return this.isDisabled }
  public get enabled() { return !this.isDisabled }

  constructor(public fileName: string) {
    this.isDisabled = !fileName.endsWith('.jar')
    this.pureName = purify(fileName)

    this.addon = Mod.addons.find(a => purify(a.installedFile.fileNameOnDisk) === this.pureName
    )

    if (!this.addon) {
      const levArr = _(Mod.addons)
        .map(a => ({
          lev  : levenshtein.get(purify(a.installedFile.fileNameOnDisk) ?? '', this.pureName ?? ''),
          addon: a,
        }
        ))
        .sortBy('lev')
        .value()

      if (levArr[1].lev - levArr[0].lev < 5) {
        T(
          chalk.bgYellow(' No addon '),
          chalk.gray(this.fileName), ' ',
          chalk.rgb(250, 250, 250)(this.pureName), '\n'
        )
        return
      }
      else {
        this.addon = levArr[0].addon
      }
    }

    this.addon.mod = this
  }

  @Memoize()
  private get dependencies(): Mod[] {
    const depsArr = (this.addon?.installedFile.dependencies ?? [])
    const deps = depsArr
      .filter(({ type }) => type === 3 || type === 2)
      .map((d) => {
        const r = Mod.getAddonById(d.addonId)
        if (!r && d.type === 3) {
          T(chalk.inverse(' No Dependency '), ' ',
            this.addon?.name, chalk.gray(` id: ${d.addonId} \n`)
          )
        }
        return r?.mod
      })
      .filter((m): m is Mod => !!m)
    this.updateDependents(deps)
    return deps
  }

  private updateDependents(deps = this.dependencies) {
    deps.forEach(d => d.dependents.add(this))
  }

  public addDependency(deps: Mod | Mod[]) {
    this.dependencies.push(...[deps].flat())
    this.updateDependents()
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
      chalk.gray(this.pureName), '\n'
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
