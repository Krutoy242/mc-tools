import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolve } from 'node:path/posix'

import { consola } from 'consola'
import fast_glob from 'fast-glob'
import levenshtein from 'fast-levenshtein'

import type { ModRgxMap, ReducerConfig } from './config'
import type { InstalledAddon, MCInstance } from './minecraftinstance'

import { DependencyLevel, Mod, ModdedAddon, purify } from './Mod'
import chalk from 'chalk'

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export class ModStore {
  readonly mods: Mod[]

  constructor(
    mcPath: string,
    config: ReducerConfig
  ) {
    const mcInstance: MCInstance = JSON.parse(
      readFileSync(join(mcPath, 'minecraftinstance.json'), 'utf8')
    )

    // Init mods
    const noAddonList: string[] = []
    Mod.modsPath = join(mcPath, 'mods')
    const fetchInModsDir = getFetchInModsDir(Mod.modsPath)
    this.mods = [...new Set([
      ...fetchInModsDir('*.jar?(.disabled)?(.disabled)?(.disabled)?(.disabled)'),
      ...fetchInModsDir('*.jar'),
    ])].map((m) => {
      const addon = findAddonByFilename(mcInstance.installedAddons, m)
      if (!addon) noAddonList.push(m)
      const mod = new Mod(m, addon)
      if (addon) addon.mod = mod
      return mod
    })
    if (noAddonList.length) {
      consola.box({
        title: 'No addon',
        message: chalk.gray(
          `This mods exist in mods/ folder, but their respective`
          + `\nentries can't be found in the file `
          + chalk.underline(`minecraftinstance.json`) + `\n\n`)
          + noAddonList.join('\n'),
      })
    }

    // Init CF-defined dependencies
    const noDependencies = new Set<string>()
    for (const m of this.mods) {
      const cfDependencies = m.addon?.installedFile.dependencies ?? []
      const required = cfDependencies.filter(({ type }) => type === DependencyLevel.Required)
      const deps = required.map((d) => {
        const r = mcInstance.installedAddons.find(o =>
          o.addonID === d.addonId // Exact match addon
          || config.forks[d.addonId]?.includes(o.addonID) // Addon is fork
        ) as ModdedAddon
        if (!r) noDependencies.add(`${m.addon?.name} ${chalk.gray(`require id: ${d.addonId}`)}`)
        return r?.mod
      })
        .filter((m): m is Mod => !!m)
      deps.forEach(d => d.dependents.add(m))
    }
    if (noDependencies.size) {
      consola.box({
        title: 'No dependencies',
        message: chalk.gray(`This mods must have dependencies, `
          + `but they are cannot be found.\n\n`)
          + [...noDependencies].sort().join('\n'),
        style: {
          padding: 0,
          borderColor: "yellow",
          marginBottom: 0
        },
      })
    }

    // Init dependencies
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
      || naturalSort(a.fileName ?? '', b.fileName ?? ''))
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

function findAddonByFilename(addons: ModdedAddon[], fileName: string) {
  const pureName = purify(fileName)

  let addon = addons.find(a =>
    purify(a.installedFile.fileNameOnDisk) === pureName
  )
  if (addon) return addon

  const levArr = addons
    .map(a => ({
      lev: levenshtein.get(purify(a.installedFile.fileNameOnDisk) ?? '', pureName ?? ''),
      addon: a,
    }))
    .sort(({ lev: a }, { lev: b }) => a - b)

  if (levArr[1]?.lev - levArr[0]?.lev < 5) {
    return
  }
  else {
    addon = levArr[0]?.addon
  }
  return addon
}
