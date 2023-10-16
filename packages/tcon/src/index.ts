import { getBorderCharacters, table } from 'table'

/** Names of config entries from `tweakerconstruct.cfg` */
export type TweakName =
  'Armory Stat Tweaks'
  | 'Arrow Shaft Stat Tweaks'
  | 'Bowstring Stat Tweaks'
  | 'Fletching Stat Tweaks'
  | 'Stat Tweaks'
  | 'Trait tweaks'

/** Structure of custom tweaking files */
export interface TweakObj {
  /** Names of material parameter, like `CoreDurability` or `MiningSpeed` */
  _names: string[]

  /** Formula of impact on `power` */
  _importancy: string[]

  /** How value would be transformed before save */
  _output: string[]

  [matID: string]: string[]
}

/** Result of parsing and tweaking */
export interface TweakedMaterial {
  /** Floating-point result of tweaking */
  nums: (number | 'd')[]

  /** Same as `nums` but with mandatory number based on default or 0.0 */
  reals: number[]

  /** ID of material */
  mat: string

  /** Total power of material after tweaks */
  power: number

  /** Line as it would be in config file */
  raw: string

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
  return /^\d+\.?\d*$/.test(s)
}

function nice(v: string | number) {
  return Math.round(Number(v) * 100) / 100
}

function d_nice(v: number | 'd') {
  return v === 'd' ? 'd' : nice(v)
}

function veryNice(v: number) {
  const val = nice(v)
  const left = val | 0
  const right = nice(val - left)
  return (
    String(left).padStart(10) + (right ? `.${String(right).substring(2, 4)}` : '')
  )
}

/**
 * @param defVal Default value from 'default_configs/tweakersconstruct.cfg'
 * @param n Tweak string
 * @param _output string to be evaluated to get result
 */
function tweakValue(
  defVal: number | 'd',
  n: string | number,
  _output: string
): number | 'd' {
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
  defaultVals: (number | 'd')[]
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

  return {
    nums,
    reals,
    mat    : matID,
    power,
    raw    : `        ${matID}:${nums.map(d_nice).join(':')}`,
    tweaked: nums.some(
      (v, i) => v !== 'd' && v !== Number(defaultVals[i])
    ),
  }
}

export function genStatsTable(tweakHead: string[], list: TweakedMaterial[]) {
  const outputTable = [
    ['', 'Total Power', ...tweakHead], // Header
    ...list.map(l => [l.mat, veryNice(l.power), ...l.reals.map(veryNice)]),
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
  tweakObj: TweakObj
) {
  const rgx = new RegExp(getLookup(tweakGroup))
  const cfgListChunk = default_tweakers_cfg.match(rgx)?.[0]
  if (!cfgListChunk) throw new Error('Can\'t parse tweakerconstruct.cfg')

  /** New recalculated values list */
  const tweakedMat: TweakedMaterial[] = []

  /** Materials that exists in current pack */
  const existMats: Set<string> = new Set()

  for (const match of cfgListChunk.matchAll(
    /^ *(?<matID>[^:\n]+):(?<rawValues>[^<\n]+)$/gm
  )) {
    if (!match.groups) throw new Error('Wrong tweakerconstruct.cfg format')
    const matID = match.groups.matID

    const defaultVals = match.groups.rawValues
      .split(':')
      .map(n => (Number.isNaN(Number(n)) ? 'd' : Number(n)))

    existMats.add(matID)

    const tweaked = tweakMaterial(matID, tweakObj, defaultVals)
    tweakedMat.push(tweaked)
  }

  tweakedMat.sort((a, b) => a.power - b.power)
  return { tweakedMat, existMats: [...existMats] }
}

/**
 * take traits from both configs to make table of traits
 */
export function parseTraits(
  tweakers_cfg: string,
  default_tweakers_cfg: string
) {
  const traits: { [name: string]: { [part: string]: Set<string> } } = {}
  mergeChunk(default_tweakers_cfg)
  mergeChunk(tweakers_cfg, true)

  function mergeChunk(fileContent: string, rewrite = false) {
    const rgx = new RegExp(getLookup('Trait tweaks'), 'i')
    const chunk = fileContent.match(rgx)?.[0]
    if (!chunk) throw new Error('Can\'t parse tweakerconstruct.cfg')

    const added = new Set<string>()

    chunk.trim().split('\n')
      .map(l =>
        l.trim().match(
          /^(?<mat>[^:\n]+):(?<part>[^:\n]+):(?<traits>.+)$/
        )?.groups as { mat: string
          part: string
          traits: string }
      )
      .filter(Boolean)
      .forEach((o) => {
        o.traits.split(',').forEach((trait) => {
          // Tweakerconstruct fully rewrite all materials traits
          if (rewrite && !added.has(o.mat)) {
            added.add(o.mat)
            traits[o.mat] = {}
          }
          ((traits[o.mat] ??= {})[o.part] ??= new Set()).add(trait)
        })
      })
  }

  return traits
}

/*

## Unused TC traits

-----------

- [x] darktraveler  | Surrounding mobs get randomly afflicted with damage.
- [x] hailhydra     | Random explosions plague your enemies. Also, when you are attacked, there is a chance to get Absorption.
- [x] hearts        | The higher your health, the more damage you do.
- [x] heavy_metal   | Increased knockback + Slowness on target.
- [x] illuminati    | While the tool is in your hand, nearby entities (that do not hold a tool with this trait) glow, and you become invisible.
- [x] morganlefay   | Bonus magic damage (ranging from 0.0 to 5.0; Gaussian distributed) is afflicted (it is absolute).
- [x] rudeawakening | Damage pierces armor (mobs only).
- [x] spades        | The lower your health, the more damage you do.
- [x] starfishy     | Press the "set portal" key (default "N") to set a virtual portal on the block you are pointing at. If you are on the brink of death, you have %d enori crystals to spare, and the portal has enough space above, then the crystals are consumed, you are teleported to the virtual portal, and you are spared. (The tool must be in your hand.)
- [x] thundering    | Summon a thunderbolt on impact.
- [x] unnamed       | Bonus damage accrued for each entity of the same type as the target close to it.
- [x] vindictive    | Bonus damage to players, and you gain some health by attacking.
- [x] blindbandit   | A mob called the "Blind Bandit" will sometimes be summoned for a limited time after you attack or are attacked. She will attack hostile mobs, and will also attack those who dare attack her (except you), piercing armor on mobs.
- [x] botanical2    |
- [x] barrett       | ❌ As health decreases, there is an increasing chance of a critical hit.
- [x] divineshield  | ❌ While this tool is in your hand, you are granted fire resistance. Also, damage is reduced, but at a durability cost.
- [x] dprk          | ❌ When attacking or defending, Supreme Leaders will spawn, exploding on opponents in the same manner as a creeper.
- [x] ghastly       | ❌ If the holder is attacked while sneaking, the attacker is inflicted with Slowness.
- [x] ignoble       | ❌ As one takes damage, one starts to harbor feelings of ignoble jealousy as the offender is killed. When this trait is enabled, those feelings are vented when attacking while sneaking.
- [x] jaded         | ❌ Mobs attacked with this tool have their ability to heal temporarily hindered.
- [x] mystical_fire | ❌ Sets the target on fire, and damages the target with magic for a certain amount of time.
- [x] naphtha       | ❌ Arrows (and bolts) burn the target on impact.
- [x] trash         | ❌ Random stuff is slowly generated when the tool is selected, but the tool is damaged slowly in this way.

❌ - Could not find trait

*/
