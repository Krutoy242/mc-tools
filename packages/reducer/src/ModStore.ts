import type { Branch, ReducerConfig } from './config.js'

import type { MCInstance } from './minecraftinstance.js'
import type { ModdedAddon } from './Mod.js'
import { readFileSync } from 'node:fs'
import { naturalSort } from '@mctools/utils/natural-sort'
import chalk from 'chalk'
import { consola } from 'consola'

import fast_glob from 'fast-glob'
// @ts-expect-error missing types
import levenshtein from 'fast-levenshtein'
import { join, resolve } from 'pathe'

import { DependencyLevel, Mod, purify } from './Mod.js'

/**
 * Per-session cache used to deduplicate noisy warnings so the user only sees
 * each unique problem once, even across multiple ModStore rebuilds.
 * Pass the same cache to every ModStore in a session; create a fresh one in tests.
 */
export interface WarningCache {
  missingDependency: Set<string>
  multipleMatches  : Set<string>
  noAddon          : Set<string>
  noDependencies   : Set<string>
}

export function createWarningCache(): WarningCache {
  return {
    missingDependency: new Set(),
    multipleMatches  : new Set(),
    noAddon          : new Set(),
    noDependencies   : new Set(),
  }
}

/** Levenshtein gap below which a fuzzy filename match is considered ambiguous. */
const FUZZY_AMBIGUITY_THRESHOLD = 5

export class ModStore {
  readonly mods: Mod[]

  constructor(
    mcPath: string,
    config: ReducerConfig,
    private readonly warnings: WarningCache = createWarningCache()
  ) {
    const mcInstance = JSON.parse(
      readFileSync(join(mcPath, 'minecraftinstance.json'), 'utf8')
    ) as MCInstance

    // Init mods
    const noAddonList: string[] = []
    Mod.modsPath = join(mcPath, 'mods')
    const fetchInModsDir = getFetchInModsDir(Mod.modsPath)
    this.mods = Array.from(new Set([
      ...fetchInModsDir('*.jar?(.disabled)?(.disabled)?(.disabled)?(.disabled)'),
      ...fetchInModsDir('*.jar'),
    ]), (m) => {
      const addon = findAddonByFilename(mcInstance.installedAddons, m)
      const mod = new Mod(m, addon)
      if (addon) addon.mod = mod
      else noAddonList.push(mod.display)
      return mod
    })
    if (noAddonList.length) {
      const newEntries = noAddonList.filter(entry => !this.warnings.noAddon.has(entry))
      if (newEntries.length > 0) {
        consola.warn({
          message   : `Found mods that don't have addon entry in ${chalk.underline('minecraftinstance.json')}`,
          additional: newEntries.join('\n'),
        })
        newEntries.forEach(entry => this.warnings.noAddon.add(entry))
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
      const newEntries = [...noDependencies].filter(entry => !this.warnings.noDependencies.has(entry))
      if (newEntries.length > 0) {
        consola.warn({
          message   : 'Mods that have missing dependencies',
          additional: newEntries.sort().join('\n'),
        })
        newEntries.forEach(entry => this.warnings.noDependencies.add(entry))
      }
    }

    // Init dependencies
    for (const [mod, dep] of flatTree(config.dependencies)) {
      const m = this.findMod(mod)
      if (!m) continue
      const d = this.findMod(dep)
      if (!d) {
        const key = `${m.fileName}-${dep}`
        if (!this.warnings.missingDependency.has(key)) {
          consola.warn(`Mod "${m.fileName}" must have dependencies [${dep}] but none found!`)
          this.warnings.missingDependency.add(key)
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
      if (!this.warnings.multipleMatches.has(key)) {
        consola.warn(`Multiple matches of mod "${modRegexp}" ${list.map(m => `[${m.addon?.name ?? ''}] ${m.fileName}`).join('\n')}`)
        this.warnings.multipleMatches.add(key)
      }
    }
    return list[0]
  }
}

function flatTree(tree: Branch): [string, string][] {
  const result: [string, string][] = []
  Object.entries(tree).forEach(([trunk, branches]) => {
    for (const branch of [branches].flat()) {
      if (typeof branch === 'object' && branch !== null) {
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

export function getFetchInModsDir(mods: string): (globPattern: string) => string[] {
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

function findAddonByFilename(addons: ModdedAddon[], fileName: string): ModdedAddon | undefined {
  const pureName = purify(fileName)

  const exact = addons.find(a => purify(a.installedFile.fileNameOnDisk) === pureName)
  if (exact) return exact

  if (addons.length === 0) return undefined

  const levArr = addons
    .map(a => ({
      lev  : (levenshtein as { get: (a: string, b: string) => number }).get(purify(a.installedFile.fileNameOnDisk) ?? '', pureName ?? ''),
      addon: a,
    }))
    .sort((a, b) => a.lev - b.lev)

  const [best, second] = levArr

  // If the second-best match is almost as close as the best, the fuzzy match is
  // ambiguous and we'd rather return nothing than pick an arbitrary candidate.
  if (second && second.lev - best.lev < FUZZY_AMBIGUITY_THRESHOLD) return undefined

  return best.addon
}
