import { getBorderCharacters, table } from 'table'

import type { MatTraits } from './traits'

/** Names of config entries from `tweakerconstruct.cfg` */
export type TweakName =
  'Armory Stat Tweaks'
  | 'Arrow Shaft Stat Tweaks'
  | 'Bowstring Stat Tweaks'
  | 'Fletching Stat Tweaks'
  | 'Stat Tweaks'
  | 'Trait tweaks'

const partGroups = {
  'Armory Stat Tweaks'     : ['core', 'plates', 'trim'],
  'Arrow Shaft Stat Tweaks': ['shaft'],
  'Bowstring Stat Tweaks'  : ['bowstring'],
  'Fletching Stat Tweaks'  : ['fletching'],
  'Stat Tweaks'            : ['head', 'projectile', 'handle', 'extra', 'bow'],
}

/** Structure of custom tweaking files */
export interface TweakObj {
  /** Formula of impact on `power` */
  _importancy: string[]

  /** Names of material parameter, like `CoreDurability` or `MiningSpeed` */
  _names: string[]

  /** How value would be transformed before save */
  _output: string[]

  [matID: string]: string[]
}

/** Result of parsing and tweaking */
export interface TweakedMaterial {
  /** ID of material */
  mat: string

  /** Floating-point result of tweaking */
  nums: ('d' | number)[]

  /** Total power of material after tweaks */
  power: number

  /** Line as it would be in config file */
  raw: string

  /** Same as `nums` but with mandatory number based on default or 0.0 */
  reals: number[]

  /** Average power of traits for each part */
  traitPower: number

  /** Is value was being changed from default */
  tweaked: boolean
}

/* ============================================
=                  Parse                      =
============================================= */

function evalMathContext(code: string, context = {}) {
  const lContext: Record<string, any> = { ...context }
  for (const k of Object.getOwnPropertyNames(Math)) lContext[k] = Math[k]

  try {
    return (
      // eslint-disable-next-line no-new-func
      new Function(...Object.keys(lContext), `return ${code}`)
    )(...Object.values(lContext))
  }
  catch (error: any) {
    console.error(`Error in evaluating code: ${code}`)
    throw error
  }
}

function isNumber(s: string) {
  return /^\d+(?:\.\d*)?$/.test(s)
}

function nice(v: number | string) {
  return Math.round(Number(v) * 100) / 100
}

function d_nice(v: 'd' | number) {
  return v === 'd' ? 'd' : nice(v)
}

function veryNice(v: number) {
  const val = nice(v)
  const left = val | 0
  const right = Math.round((Math.abs(val) - Math.abs(left)) * 100)
  return (
    String(left).padStart(10) + (right ? `.${String(right)}` : '')
  )
}

/**
 * @param defVal Default value from 'default_configs/tweakersconstruct.cfg'
 * @param n Tweak string
 * @param _output string to be evaluated to get result
 */
function tweakValue(
  defVal: 'd' | number,
  n: number | string,
  _output: string
): 'd' | number {
  if (n == null || n === '' || n === 'd' || n === defVal) return 'd'

  // Convert 'n' when its in form of math '*2'
  if (!isNumber(String(n))) n = Number.parseFloat(evalMathContext(`${defVal}${n}`, { n }))
  else n = Number(n)

  // Calculate output result (usually rounding value or make non-negative)
  /** @type {number} */
  const result: number = evalMathContext(_output, { n })

  // After changes value didnt mutated
  if (result === Number(defVal)) return 'd'

  return result
}

/**
 *
 * @param {string} matID
 * @param {TweakObj} tweakObj
 * @param {(number|'d')[]} defaultVals String of number or 'd'
 */
function tweakMaterial(
  matID: string,
  tweakObj: TweakObj,
  defaultVals: ('d' | number)[],
  traitPower: number
): TweakedMaterial {
  const nums = defaultVals.map((defVal, i) =>
    tweakValue(defVal, tweakObj[matID]?.[i], tweakObj._output?.[i] ?? 'n')
  )

  /**
   * Factical material stats
   * @type {number[]}
   */
  const reals: number[] = nums.map((n, i) =>
    typeof n !== 'number' || Number.isNaN(Number(n))
      ? Number(defaultVals[i]) || 0.0
      : n
  )

  // Compute total power of material after tweaks
  let power = 0
  reals.forEach((real, i) => {
    power += evalMathContext(tweakObj._importancy[i], { n: real })
  })

  // Add Trait value
  power += traitPower

  return {
    nums,
    reals,
    mat    : matID,
    power,
    traitPower,
    raw    : `        ${matID}:${nums.map(d_nice).join(':')}`,
    tweaked: nums.some(
      (v, i) => v !== 'd' && v !== Number(defaultVals[i])
    ),
  }
}

export function genStatsTable(tweakHead: string[], list: TweakedMaterial[]) {
  const outputTable = [
    ['', 'Total Power', 'Trats Value', ...tweakHead], // Header
    ...list.map(l => [
      l.mat,
      veryNice(l.power),
      veryNice(l.traitPower),
      ...l.reals.map(veryNice),
    ]),
  ]

  return table(outputTable, {
    border: {
      ...getBorderCharacters('void'),
      bodyJoin: ',',
    },
    columnDefault: {
      paddingLeft : 0,
      paddingRight: 1,
    },
    drawHorizontalLine: () => false,
  })
}

/**
 * Get table chunk from .cfg file as string
 * @param tweakGroup name of config
 * @returns chunk with text in this config
 */
export function getLookup(tweakGroup: TweakName) {
  return `(S:"?${tweakGroup}"? <[\\n\\r])([\\r\\s\\S]*?)\\n(     >)`
}

/**
 * Compare group of parameters like "Armory Stat Tweaks" or "Fletching Stat Tweaks"
 * And save them to variable
 */
export function parseStats(
  default_tweakers_cfg: string,
  tweakGroup: TweakName,
  tweakObj: TweakObj,
  traitPowers?: MatTraits<number>
) {
  const rgx = new RegExp(getLookup(tweakGroup))
  const cfgListChunk = default_tweakers_cfg.match(rgx)?.[0]
  if (!cfgListChunk) throw new Error('Can\'t parse tweakerconstruct.cfg')

  /** New recalculated values list */
  const tweakedMat: TweakedMaterial[] = []

  /** Materials that exists in current pack */
  const existMats: Set<string> = new Set()

  // Trait power
  const parts: string[] = partGroups[tweakGroup]
  const noTraitsMaterials:string[] = []

  for (const match of cfgListChunk.matchAll(
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    /^ *(?<matID>[^:\n]+):(?<rawValues>[^<\n]+)$/gm
  )) {
    if (!match.groups) throw new Error('Wrong tweakerconstruct.cfg format')
    const matID = match.groups.matID

    const defaultVals = match.groups.rawValues
      .split(':')
      .map(n => (Number.isNaN(Number(n)) ? 'd' : Number(n)))

    existMats.add(matID)

    // Calculate trait power
    const partsValues: number[] = []
    if (traitPowers) {
      for (const part of parts) {
        const val = traitPowers[matID]?.[part]
        if (val === undefined) noTraitsMaterials.push(`${matID}/${part}`)
        else partsValues.push(val)
      }
    }
    const traitPower = partsValues.length
      ? partsValues.reduce((a, b) => (a || 0) + (b || 0), 0) / partsValues.length
      : 0

    const tweaked = tweakMaterial(matID, tweakObj, defaultVals, traitPower)
    tweakedMat.push(tweaked)
  }

  // if (noTraitsMaterials.length) process.stderr.write(`⚠️ [${tweakGroup}] No values for material/part:\n${noTraitsMaterials.join('\n')}\n`)

  tweakedMat.sort((a, b) => a.power - b.power)
  return { tweakedMat, existMats: [...existMats] }
}
