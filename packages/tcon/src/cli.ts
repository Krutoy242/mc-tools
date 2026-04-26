#!/usr/bin/env tsx
/* eslint-disable ts/no-unsafe-assignment */

import type { TweakName, TweakObj } from './index.js'
import type { MatTraits } from './traits.js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import { parse as csvParseSync } from 'csv-parse/sync'

import fast_glob from 'fast-glob'
import yargs from 'yargs'

import { genStatsTable, getLookup, parseStats } from './index.js'
import { parseTraits } from './traits.js'

/* =============================================
=                Arguments                    =
============================================= */

const argv = yargs(process.argv.slice(2))
  .alias('h', 'help')
  .detectLocale(false)
  .scriptName('@mctools/tcon')
  .strict()
  .version()
  .wrap(null)
  .option('default', {
    alias       : 'd',
    normalize   : true,
    demandOption: true,
    describe    : 'Path default tweakersconstruct.cfg (with "Fill Defaults" enabled)',
    coerce      : (f: string) => {
      return readFileSync(assertPath(f), 'utf8')
    },
  })
  .option('mc', {
    alias    : 'm',
    normalize: true,
    default  : './',
    describe : 'Minecraft directory',
    coerce   : (f: string) => {
      const twcPath = resolve(f, 'config/tweakersconstruct.cfg')
      assertPath(twcPath)
      return f
    },
  })
  .option('save', {
    alias    : 's',
    normalize: true,
    describe : 'Where to save new sorted stats',
  })
  .option('tweaks', {
    alias       : 't',
    normalize   : true,
    demandOption: true,
    describe    : 'Directory with tweaks csv files',
    coerce      : (f: string) => assertPath(f),
  })
  .parseSync()

/* ============================================
=                                             =
============================================= */
function saveText(txt: string, filename: string) {
  mkdirSync(dirname(filename), { recursive: true })
  writeFileSync(filename, txt)
}

function parseTweaks(tweaksPath: string) {
  const tweaksCSVList = fast_glob.sync(
    join(tweaksPath, '*.csv').replace(/\\/g, '/'),
    {
      dot: true,
    }
  )

  if (!tweaksCSVList.length)
    throw new Error('Cant find any tweak .csv files')

  return tweaksCSVList.map((filePath) => {
    const csvResult: string[][] = csvParseSync(readFileSync(filePath, 'utf8'))

    const materialTweaks = {} as unknown as TweakObj
    for (const v of csvResult) {
      materialTweaks[v[0]] = v.slice(1)
    }
    return [parse(filePath).name as TweakName, materialTweaks] as const
  })
}

void (async () => {
  console.log('[1/3] Loading configs')
  const tweakerconstruct_cfg_path = resolve(argv.mc, 'config/tweakersconstruct.cfg')
  let newConfig = readFileSync(tweakerconstruct_cfg_path, 'utf8')

  const invalid = {
    material: new Set<string>(),
    absent  : new Set<string>(),
  }

  process.stdout.write('[2/3] Fetching Traits')
  let traitPower: MatTraits<number> | undefined

  if (argv.save) {
    const traits = parseTraits(newConfig, argv.default)
    const traitValues = csvParseSync(readFileSync(resolve(argv.save, 'Traits.csv'), 'utf8')) as string[][]
    const traitMap = Object.fromEntries(traitValues.map(([,id, value]) => [id, Number(value)]))
    traitPower = {}
    for (const [mat, parts] of Object.entries(traits)) {
      for (const [part, traitIds] of Object.entries(parts)) {
        (traitPower[mat] ??= {})[part] ??= 0
        traitPower[mat][part] += Array.from(traitIds, id => traitMap[id])
          .reduce((a, b) => (a || 0) + (b || 0), 0)
      }
    }
  }
  process.stdout.write('done\n')

  process.stdout.write('[3/3] Applying tweaks')
  for (const [tweakGroup, tweakObj] of parseTweaks(argv.tweaks)) {
    const { tweakedMat, existMats } = parseStats(argv.default, tweakGroup, tweakObj, traitPower)

    // Save changes in new config text
    newConfig = newConfig.replace(
      new RegExp(getLookup(tweakGroup), 'm'),
      `$1${
        `${tweakedMat
          .filter(l => l.tweaked)
          .map(l => l.raw)
          .join('\n')}\n`
      }$3`
    )

    // Invalid tweaks (exist in tweaks, but absent in actual tweakerconstruct.cfg)
    Object.keys(tweakObj)
      .filter(o => !o.startsWith('_') && !existMats.includes(o))
      .forEach(o => invalid.material.add(o))
    existMats
      .filter(s => !tweakObj[s])
      .forEach(o => invalid.absent.add(o))

    // Save new tweak tables for easy understand values
    if (argv.save) {
      const csvTable = genStatsTable(tweakObj._names, tweakedMat)
      saveText(
        csvTable,
        resolve(argv.save, `${tweakGroup.replace(/\s+Tweaks$/i, 's')}.csv`)
      )
    }
    process.stdout.write('.')
  }
  saveText(newConfig, tweakerconstruct_cfg_path)
  process.stdout.write('done\n')

  // Show invalid tweaks
  Object.entries(invalid).forEach(([key, set]) => {
    if (set.size === 0) return
    process.stdout.write(String(
      {
        material: `Found ${set.size} invalid materials for tweaks: ${[
          ...set,
        ].join(', ')}`,
        absent: `Found ${set.size} materials without tweaks: ${[...set].join(
          ', '
        )}`,
      }[key]
    ))
  })
})()
