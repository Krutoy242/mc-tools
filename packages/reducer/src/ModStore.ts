import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { MCInstance } from './minecraftinstance'

import { getFetchInModsDir } from '.'
import { Mod } from './Mod'
import { bind } from './bind'

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const mandatoryDeps = {
  'OpenComputers-'                 : ['Scala'],
  'Thaumic Computers'              : ['Thaumcraft-', 'OpenComputers-'],
  'AE2 Wireless Fluid Terminal'    : ['p455w0rd\'s Library', 'AE2 Wireless Terminal Library'],
  'Wireless Pattern Terminal'      : ['p455w0rd\'s Library', 'AE2 Wireless Terminal Library'],
  'ContentTweaker Registry Orderer': ['ContentTweaker-'],
  'FindMeAnyDurability'            : ['Had Enough Items'],
  'ModTweaker'                     : ['MTLib'],
  'JEIExporter-'                   : ['Had Enough Items'],
  'thaumicenergistics-'            : ['Thaumcraft-'],
  'ModDirector'                    : ['thaumicenergistics-'],
  'Loot Capacitor Tooltips'        : ['^Ender IO$'],
  'Compact Solars'                 : ['Industrial Craft'],
  'Deep Blood Evolution'           : ['Deep Mob Evolution', 'Blood Magic'],
  'Ender Storage continuation'     : ['CodeChicken Lib 1.8.+'],
  'valkyrielib'                    : ['RoughlyEnoughIDs'],
  'Mekanism.+Generators'           : ['^Mekanism Community Edition$'],
  'RandomTweaker'                  : ['Zen Utils'],
  'RecurrentComplex'               : ['IvToolkit'],
  'Trinity'                        : ['NuclearCraft(: Overhauled)?$'],
  'CofH Core'                      : ['Redstone Flux'],
  'Actually Baubles'               : ['Actually Additions'],
  '^Quark$'                        : ['AutoRegLib'],
  '^Quark: RotN'                   : ['AutoRegLib'],

  // Fugue deps
  'Advanced Rocketry'          : ['Fugue'],
  'Armourer\'s Workshop'       : ['Fugue'],
  'Astral Sorcery'             : ['Fugue'],
  'Botania Tweaks'             : ['Fugue'],
  'Charset'                    : ['Fugue'],
  'CodeChickenLib'             : ['Fugue'],
  'Custom Main Menu'           : ['Fugue'],
  'Custom NPCs'                : ['Fugue'],
  'Enchantments Control'       : ['Fugue'],
  'EnderCore'                  : ['Fugue'],
  'Entity Distance'            : ['Fugue'],
  'Extra Utilities 2'          : ['Fugue'],
  'FoamFix'                    : ['Fugue'],
  'Forge Multipart'            : ['Fugue'],
  'GregTech CE Unofficial'     : ['Fugue'],
  'Hammer Lib'                 : ['Fugue'],
  'Howling Moon'               : ['Fugue'],
  'IC2C Extra'                 : ['Fugue'],
  'In Control!'                : ['Fugue'],
  'Lag Goggles'                : ['Fugue'],
  'Logistics Pipes'            : ['Fugue'],
  'LoliASM'                    : ['Fugue'],
  'MAGE'                       : ['Fugue'],
  'Mcjty Core'                 : ['Fugue'],
  'Nothirium'                  : ['Fugue'],
  'OpenDisks'                  : ['Fugue'],
  'OpenModsLib'                : ['Fugue'],
  'OpenSecurity'               : ['Fugue'],
  'Project:Red'                : ['Fugue'],
  'ReplayMod'                  : ['Fugue'],
  'Shoulder Surfing Reloaded'  : ['Fugue'],
  'Simply Hot Spring'          : ['Fugue'],
  'Smooth Font'                : ['Fugue'],
  'Snow! Real Magic'           : ['Fugue'],
  'Solar Flux Reborn'          : ['Fugue'],
  'SplashAnimation'            : ['Fugue'],
  'Subauqatic (Temporary)'     : ['Fugue'],
  'Survival Inc.'              : ['Fugue'],
  'TFC Medicinal'              : ['Fugue'],
  'Thaumic Speedup (Temporary)': ['Fugue'],
  'Valkyrie (Temporary)'       : ['Fugue'],
  'Vampirism'                  : ['Fugue'],
  'Water Power'                : ['Fugue'],
  'Xaero Plus'                 : ['Fugue'],
  '^XNet'                      : ['Fugue'],
  'ZeroCore (ExtremeReactor)'  : ['Fugue'],
}

interface ModConfig {
  mandatoryDeps: { [mod: string]: string[] }
}

export class ModStore {
  readonly mods: Mod[]

  constructor(
    mcPath: string,
    config: ModConfig = {
      mandatoryDeps,
    }
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

    // Add mandatory addons list
    Object.entries(config.mandatoryDeps).forEach(([modName, deps]) => {
      const modNeedDep = this.findMod(modName)
      if (!modNeedDep) return
      const depMods = deps.map(this.findMod)
        .filter((d): d is Mod => !!d)
        .filter(d => d !== modNeedDep)
      if (!depMods.length) {
        console.log(
          `Mod "${modName}" must have dependencies `
          + `[${deps.map(s => `'${s}'`).join(', ')}] but none found!`
        )
      }
      else {
        modNeedDep.addDependency(depMods)
      }
    })

    this.mods.sort((a, b) =>
      a.getDepsLevel() - b.getDepsLevel()
      || a.dependents.size - b.dependents.size
      || naturalSort(a.pureName ?? '', b.pureName ?? ''))
  }

  @bind
  private findMod(name: string): Mod | undefined {
    const rgx = new RegExp(name, 'i')
    const list = this.mods.filter(m =>
      m.addon?.name === name
      || m.addon?.name.match(rgx)
      || rgx.test(m.fileName)
    )
    list.sort((a, b) => (a.addon?.name.length ?? 0) - (b.addon?.name.length ?? 0))
    if (list.length > 1) console.log(`Multiple matches of mod "${name}"`, list.map(m => `[${m.addon?.name ?? ''}] ${m.fileName}`))
    return list[0]
  }
}
