import { readFileSync } from 'node:fs'
import { bind } from './bind'
import type { MCInstance } from './minecraftinstance'
import { Mod } from './Mod'
import { getFetchInModsDir } from '.'

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const mandatoryDeps = {
  'Thaumic Computers'              : ['Thaumcraft', 'OpenComputers'],
  'AE2 Wireless Fluid Terminal'    : ['p455w0rd\'s Library', 'AE2 Wireless Terminal Library'],
  'Wireless Pattern Terminal'      : ['p455w0rd\'s Library', 'AE2 Wireless Terminal Library'],
  'ContentTweaker Registry Orderer': ['ContentTweaker'],
  'FindMeAnyDurability'            : ['Had Enough Items'],
  'ModTweaker'                     : ['MTLib'],
  'JEIExporter-'                   : ['Had Enough Items'],
  'thaumicenergistics-'            : ['Thaumcraft'],
  'ModDirector'                    : ['thaumicenergistics-'],
  'Loot Capacitor Tooltips'        : ['Ender IO'],
  'Compact Solars'                 : ['Industrial Craft'],
  'Deep Blood Evolution'           : ['Deep Mob Evolution', 'Blood Magic'],
  'Ender Storage continuation'     : ['CodeChicken Lib 1.8.+'],
}

interface ModConfig {
  mandatoryDeps: { [mod: string]: string[] }
}

export class ModStore {
  readonly mods: Mod[]

  constructor(
    modsPath: string,
    mcInstancePath: string,
    config: ModConfig = {
      mandatoryDeps,
    }
  ) {
    Mod.modsPath = modsPath

    const mcInstance: MCInstance = JSON.parse(
      readFileSync(mcInstancePath, 'utf8')
    )
    Mod.addons = mcInstance.installedAddons

    const fetchInModsDir = getFetchInModsDir(modsPath)
    this.mods = [...new Set([
      ...fetchInModsDir('*.jar?(.disabled)?(.disabled)?(.disabled)?(.disabled)'),
      ...fetchInModsDir('*.jar'),
    ])].map(m => new Mod(m))

    // Add mandatory addons list
    Object.entries(config.mandatoryDeps).forEach(([modName, deps]) => {
      this.toMod(modName)?.addDependency(
        deps.map(this.toMod).filter((d): d is Mod => !!d)
      )
    })

    this.mods.sort((a, b) =>
      a.getDepsLevel() - b.getDepsLevel()
      || a.dependents.size - b.dependents.size
      || naturalSort(a.pureName ?? '', b.pureName ?? ''))
  }

  @bind
  private toMod(name: string) {
    return this.mods.find(m => m.addon?.name === name || m.fileName.startsWith(name))
  }
}
