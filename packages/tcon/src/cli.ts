#!/usr/bin/env tsx
/* eslint-disable ts/no-unsafe-assignment */

import type { TweakName, TweakObj } from './index.js'
import type { MatTraits } from './traits.js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import { defineCommand, runMain } from 'citty'
import { parse as csvParseSync } from 'csv-parse/sync'
import { globSync } from 'tinyglobby'

import { genStatsTable, getLookup, parseStats } from './index.js'
import { parseTraits } from './traits.js'

function saveText(txt: string, filename: string) {
  mkdirSync(dirname(filename), { recursive: true })
  writeFileSync(filename, txt)
}

function parseTweaks(tweaksPath: string) {
  const tweaksCSVList = globSync(
    join(tweaksPath, '*.csv').replace(/\\/g, '/'),
    { dot: true }
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

const main = defineCommand({
  meta: {
    name       : '@mctools/tcon',
    description: 'Tweaks Tinker Constructs\' materials with csv tables',
  },
  args: {
    default: {
      type       : 'string',
      alias      : 'd',
      required   : true,
      description: 'Path to default tweakersconstruct.cfg (with "Fill Defaults" enabled)',
    },
    mc: {
      type       : 'string',
      alias      : 'm',
      default    : './',
      description: 'Minecraft directory',
    },
    save: {
      type       : 'string',
      alias      : 's',
      description: 'Where to save new sorted stats',
    },
    tweaks: {
      type       : 'string',
      alias      : 't',
      required   : true,
      description: 'Directory with tweaks csv files',
    },
  },
  async run({ args }) {
    const defaultCfgContent = readFileSync(assertPath(args.default), 'utf8')

    const twcPath = resolve(args.mc, 'config/tweakersconstruct.cfg')
    assertPath(twcPath)
    const tweaksPath = assertPath(args.tweaks)

    console.log('[1/3] Loading configs')
    let newConfig = readFileSync(twcPath, 'utf8')

    const invalid = {
      material: new Set<string>(),
      absent  : new Set<string>(),
    }

    process.stdout.write('[2/3] Fetching Traits')
    let traitPower: MatTraits<number> | undefined

    if (args.save) {
      const traits = parseTraits(newConfig, defaultCfgContent)
      const traitValues = csvParseSync(readFileSync(resolve(args.save, 'Traits.csv'), 'utf8')) as string[][]
      const traitMap = Object.fromEntries(traitValues.map(([, id, value]) => [id, Number(value)]))
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
    for (const [tweakGroup, tweakObj] of parseTweaks(tweaksPath)) {
      const { tweakedMat, existMats } = parseStats(defaultCfgContent, tweakGroup, tweakObj, traitPower)

      newConfig = newConfig.replace(
        new RegExp(getLookup(tweakGroup), 'm'),
        `$1${
          `${tweakedMat
            .filter(l => l.tweaked)
            .map(l => l.raw)
            .join('\n')}\n`
        }$3`
      )

      Object.keys(tweakObj)
        .filter(o => !o.startsWith('_') && !existMats.includes(o))
        .forEach(o => invalid.material.add(o))
      existMats
        .filter(s => !tweakObj[s])
        .forEach(o => invalid.absent.add(o))

      if (args.save) {
        const csvTable = genStatsTable(tweakObj._names, tweakedMat)
        saveText(
          csvTable,
          resolve(args.save, `${tweakGroup.replace(/\s+Tweaks$/i, 's')}.csv`)
        )
      }
      process.stdout.write('.')
    }
    saveText(newConfig, twcPath)
    process.stdout.write('done\n')

    Object.entries(invalid).forEach(([key, set]) => {
      if (set.size === 0) return
      process.stdout.write(String(
        {
          material: `Found ${set.size} invalid materials for tweaks: ${[...set].join(', ')}`,
          absent  : `Found ${set.size} materials without tweaks: ${[...set].join(', ')}`,
        }[key]
      ))
    })
  },
})

void runMain(main)
