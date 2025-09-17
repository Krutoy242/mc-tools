import { readFileSync } from 'node:fs'

import chalk from 'chalk'
import { consola } from 'consola'
import fast_glob from 'fast-glob'
import levenshtein from 'fast-levenshtein'
import { join, resolve } from 'pathe'

import type { Branch, ReducerConfig } from './config'
import type { MCInstance } from './minecraftinstance'
import type { ModdedAddon } from './Mod'

import { DependencyLevel, Mod, purify } from './Mod'

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export class ModStore {
  static loggedNoAddon = new Set<string>()
  static loggedNoDependencies = new Set<string>()
  static loggedMissingDependency = new Set<string>()
  static loggedMultipleMatches = new Set<string>()
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
      const mod = new Mod(m, addon)
      if (addon) addon.mod = mod
      else noAddonList.push(mod.display)
      return mod
    })
    if (noAddonList.length) {
      const newEntries = noAddonList.filter(entry => !ModStore.loggedNoAddon.has(entry))
      if (newEntries.length > 0) {
        consola.warn({
          message   : `Found mods that don't have addon entry in ${chalk.underline('minecraftinstance.json')}`,
          additional: newEntries.join('\n'),
        })
        newEntries.forEach(entry => ModStore.loggedNoAddon.add(entry))
      }
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

      m.addDependency(deps)
      deps.forEach(d => d.dependents.add(m))
    }
    if (noDependencies.size) {
      const newEntries = [...noDependencies].filter(entry => !ModStore.loggedNoDependencies.has(entry))
      if (newEntries.length > 0) {
        consola.warn({
          message   : 'Mods that have missing dependencies',
          additional: newEntries.sort().join('\n'),
        })
        newEntries.forEach(entry => ModStore.loggedNoDependencies.add(entry))
      }
    }

    // Init dependencies
    for (const [mod, dep] of flatTree(config.dependencies)) {
      const m = this.findMod(mod)
      if (!m) continue
      const d = this.findMod(dep)
      if (!d) {
        const key = `${m.fileName}-${dep}`
        if (!ModStore.loggedMissingDependency.has(key)) {
          consola.warn(`Mod "${m.fileName}" must have dependencies [${dep}] but none found!`)
          ModStore.loggedMissingDependency.add(key)
        }
        continue
      }
      m.addDependency(d)
    }

    for (const [mod, dep] of flatTree(config.dependents)) {
      const m = this.findMod(mod)
      if (!m) continue
      const d = this.findMod(dep)
      if (!d) continue
      d.addDependency(m)
    }

    this.mods.sort((a, b) =>
      a.getDepsLevel() - b.getDepsLevel()
      || a.dependents.size - b.dependents.size
      || naturalSort(a.fileName ?? '', b.fileName ?? ''))
  }

  private findMod(modRegexp: string): Mod | undefined {
    const rgx = new RegExp(modRegexp, 'i')
    const list = this.mods.filter(m =>
      m.addon?.name === modRegexp
      || m.addon?.name.match(rgx)
      || rgx.test(m.fileName)
    )
    list.sort((a, b) => (a.addon?.name.length ?? 0) - (b.addon?.name.length ?? 0))
    if (list.length > 1) {
      const key = `${modRegexp}-${list.map(m => m.fileName).join(',')}`
      if (!ModStore.loggedMultipleMatches.has(key)) {
        consola.warn(`Multiple matches of mod "${modRegexp}" ${list.map(m => `[${m.addon?.name ?? ''}] ${m.fileName}`).join('\n')}`)
        ModStore.loggedMultipleMatches.add(key)
      }
    }
    return list[0]
  }
}

function flatTree(tree: Branch): [string, string][] {
  const result: [string, string][] = []
  Object.entries(tree).forEach(([trunk, branches]) => {
    for (const branch of [branches].flat()) {
      if (typeof branch === 'object') {
        for (const b of Object.keys(branch)) {
          result.push([trunk, b])
        }
        const depMods = flatTree(branch)
        result.push(...depMods)
      }
      else {
        result.push([trunk, branch])
      }
    }
  })
  return result
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
      lev  : levenshtein.get(purify(a.installedFile.fileNameOnDisk) ?? '', pureName ?? ''),
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
