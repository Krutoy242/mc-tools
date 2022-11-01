import { readFileSync } from 'fs'
import terminal_kit from 'terminal-kit'
import _ from 'lodash'
import chalk from 'chalk'
import type { InstalledAddon, MCInstance } from './minecraftinstance'
import { Mod, getStatusText } from './Mod'
import { getFetchInModsDir } from '.'

const { terminal: T } = terminal_kit

export function naturalSort(a, b) {
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
}

export const style = {
  suspective: chalk.rgb(150, 120, 0),
  trusted   : chalk.rgb(0, 120, 30),
}

export type ModdedAddon = InstalledAddon & { mod?: Mod }

export async function binary(modsPath: string) {
  const fetchInModsDir = getFetchInModsDir(modsPath)

  const mcInstance: MCInstance = JSON.parse(
    readFileSync('minecraftinstance.json', 'utf8')
  )
  Mod.modsPath = modsPath
  Mod.addons = mcInstance.installedAddons

  const mods = [
    ...fetchInModsDir('*.jar.disabled'),
    ...fetchInModsDir('*.jar.disabled.disabled'),
    ...fetchInModsDir('*.jar.disabled.disabled.disabled'),
    ...fetchInModsDir('*.jar.disabled.disabled.disabled.disabled'),
    ...fetchInModsDir('*.jar'),
  ].map(m => new Mod(m))

  function toMod(name: string) {
    return mods.find(m => m.addon?.name === name || m.fileName.startsWith(name))
  }

  // Add mandatory addons list
  Object.entries(mandatoryDeps).forEach(([modName, deps]) => {
    toMod(modName)?.addDependency(
      deps.map(toMod).filter((d): d is Mod => !!d)
    )
  })

  mods.sort((a, b) =>
    a.getDepsLevel() - b.getDepsLevel()
    || a.dependents.size - b.dependents.size
    || naturalSort(a.pureName, b.pureName))

  await binaryLoop(mods)

  return mods
}

async function binaryLoop(mods: Mod[]) {
  while (true) {
    T('There is ', chalk.green(mods.length), 'mods:\n', drawMods(mods), '\n')
    await disableSecondHalf(mods)

    T('Now, does ', chalk.red('error'), ' still persist?\n', drawMods(mods), '\n')
    await askErrorPersist(mods)
  }
}

async function disableSecondHalf(mods: Mod[]) {
  if (await ask([style.suspective('Disable Second half'), chalk.white('Enable everything and exit')])) {
    for (const m of mods) await m.enable()
    T`Enabled `.green`${mods.length}`.styleReset()` mods\n`
    process.exit(0)
  }
  const isSus = (m: Mod) => m.status !== 'trusted'
  const susMods = mods.filter(isSus)
  const enabledSusCount = () => susMods.filter(m => m.enabled).length
  for (const m of mods) {
    (m.status === 'trusted' || enabledSusCount() > susMods.length / 2)
      ? await m.disable()
      : await m.enable()
  }
}

async function askErrorPersist(mods: Mod[]) {
  const noError = await ask([chalk.green('No error'), chalk.red('Has error')]) === 0

  for (const m of mods) {
    if (noError) {
      if (m.enabled) m.status = 'trusted'
      if (m.status !== 'trusted') m.status = 'suspective'
    }
    else {
      if (m.enabled && m.status !== 'trusted') m.status = 'suspective'
      else m.status = 'trusted'
    }
  }
}

async function ask(options: string[]) {
  const menu = T.singleColumnMenu(options, { cancelable: true })
  const result = (await menu.promise)
  if (result.canceled) return process.exit(0)
  if (result.selectedIndex > 1) throw new Error('Unimplemented option')
  return result.selectedIndex
}

function drawMods(mods: Mod[]) {
  const w = Math.min(T.width ?? 80, 80)
  const chunks = _.chunk(mods, w)
    .map(chunk => chunk.map(m => m.statusText).join(''))
    .join('\n')

  const keys = Object.keys(style) as any[]
  return `Enabled and Disabled ${
    chalk.gray(keys.join(' '))
  } ${keys.map(k => getStatusText(k, true)).join('')} ${keys.map(k => getStatusText(k, false)).join('')}
${chunks}`
}
