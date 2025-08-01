import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path/posix'

import { consola } from 'consola'
import fast_glob from 'fast-glob'

import type { ModRgxMap, ReducerConfig } from './config'
import type { MCInstance } from './minecraftinstance'

import { Mod } from './Mod'

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export class ModStore {
  readonly mods: Mod[]

  constructor(
    mcPath: string,
    config: ReducerConfig
  ) {
    Mod.modsPath = join(mcPath, 'mods')

    const mcInstance: MCInstance = JSON.parse(
      readFileSync(join(mcPath, 'minecraftinstance.json'), 'utf8')
    )
    Mod.addons = mcInstance.installedAddons

    const fetchInModsDir = getFetchInModsDir(Mod.modsPath)
    this.mods = [...new Set([
      ...fetchInModsDir('*.jar?(.disabled)?(.disabled)?(.disabled)?(.disabled)'),
      ...fetchInModsDir('*.jar'),
    ])].map(m => new Mod(m))

    this.modRgxToMods(config.dependencies).forEach(([mod, deps]) => {
      if (!deps.length) {
        const depsSerialized = deps.map(s => `'${s}'`).join(', ')
        consola.warn(`Mod "${mod.fileName}" must have dependencies [${depsSerialized}] but none found!`)
      }
      else {
        mod.addDependency(deps)
      }
    })

    this.modRgxToMods(config.dependents).forEach(([mod, deps]) => {
      for (const dep of deps) {
        dep.addDependency(mod)
      }
    })

    this.mods.sort((a, b) =>
      a.getDepsLevel() - b.getDepsLevel()
      || a.dependents.size - b.dependents.size
      || naturalSort(a.pureName ?? '', b.pureName ?? ''))
  }

  private modRgxToMods(map: ModRgxMap) {
    const result: [Mod, Mod[]][] = []
    Object.entries(map).forEach(([modRgx, deps]) => {
      const mod = this.findMod(modRgx)
      if (!mod) return

      const depMods = [deps]
        .flat()
        .map(rgx => this.findMod(rgx))
        .filter(d => !!d)
        .filter(d => d !== mod)

      result.push([
        mod,
        depMods,
      ])
    })
    return result
  }

  private findMod(modRegexp: string): Mod | undefined {
    const rgx = new RegExp(modRegexp, 'i')
    const list = this.mods.filter(m =>
      m.addon?.name === modRegexp
      || m.addon?.name.match(rgx)
      || rgx.test(m.fileName)
    )
    list.sort((a, b) => (a.addon?.name.length ?? 0) - (b.addon?.name.length ?? 0))
    if (list.length > 1) console.log(`Multiple matches of mod "${modRegexp}"`, list.map(m => `[${m.addon?.name ?? ''}] ${m.fileName}`))
    return list[0]
  }
}

export function getFetchInModsDir(mods: string) {
  /**
   * Return relative to mods/ path (only file name with extension)
   */
  function fetchInModsDir(globPattern: string): string[] {
    return fast_glob.sync(globPattern, { dot: true, cwd: resolve(mods) })
  }
  if (!fetchInModsDir('*.jar?(.disabled)').length)
    throw new Error(`${mods} doesn't have mods in it (files ends with .jar and/or .disabled)`)
  return fetchInModsDir
}
