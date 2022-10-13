#!/usr/bin/env node

import { rename } from 'fs/promises'
import { resolve } from 'path'
import { existsSync } from 'fs'
import yargs from 'yargs'
import chalk from 'chalk'
import _ from 'lodash'

import terminal_kit from 'terminal-kit'
import type { ReduceLevels } from './levels'
import { loadReduceLevels } from './levels'
import { getFetchInModsDir } from '.'
const { terminal } = terminal_kit

/* =============================================
=                Arguments                    =
============================================= */
const argv = yargs(process.argv.slice(2))
  .alias('h', 'help')
  .option('cwd', {
    alias   : 'c',
    type    : 'string',
    describe: 'Minecraft folder path',
    default : './',
  })
  .option('levels', {
    alias       : 'l',
    type        : 'string',
    describe    : 'Path to JSON with reduction levels',
    demandOption: true,
  })
  .parseSync()

const modsFOlder = resolve(argv.cwd, 'mods')
if (!existsSync(modsFOlder))
  throw new Error(`${resolve(argv.cwd)} doesn't have mods/ folder. Provide right path.`)

const fetchInModsDir = getFetchInModsDir(argv.cwd)

if (!fetchInModsDir('*.jar?(.disabled)').length)
  throw new Error(`${modsFOlder} doesn't have mods in it (files ends with .jar and/or .disabled)`)

/* =============================================
=                                             =
============================================= */

function exit() { process.exit() }

const getFileName = (s: string) => s.replace(/^.*[\\/]/, '')

async function init() {
  const alreadyDisabled = fetchInModsDir('*.jar.disabled')
  const allEnabledMods = fetchInModsDir('*.jar')
  const totalModsLength = allEnabledMods.length + alreadyDisabled.length

  terminal.clear()

  const jsonObj: ReduceLevels = (await import(argv.levels)).default
  const levels = loadReduceLevels(jsonObj, argv.cwd)

  const unregMods = _.difference(allEnabledMods, levels.registeredMods).map(getFileName)
  if (unregMods.length) {
    console.warn(
      'This mods unregistered in lists. Add them first :>> ',
      unregMods
    )
  }

  if (levels.nonexistingEntries.length) {
    console.warn(
      'This lines have no files :>> ',
      levels.nonexistingEntries
    )
  }

  if (levels.severalVariations.length) {
    console.warn(
      'This lines have several variations :>> ',
      levels.severalVariations
    )
  }

  terminal`\nSelect `.brightYellow`Reduce Level`.styleReset()` for `.green(
    totalModsLength
  )` mods`.styleReset()`\n`

  const getLevelText = (i: number) =>
    chalk.rgb(
      244,
      (255 - (255 / levels.levels.length) * i) | 0,
      59
    )(levels.levels[i].name)

  let cumulativeReduction = 0
  const reduceIndex = (
    await terminal.singleColumnMenu(
      levels.levels.map(
        (l, i) =>
          `${i + 1}: `
          + `${getLevelText(i)} `
          + `(${chalk.red.dim(
            `-${
              cumulativeReduction += l.files.length + l.disabledFiles.length}`
          )}) `
          + `${chalk.rgb(100, 100, 100)(l.description)}`
      )
    ).promise
  ).selectedIndex

  terminal('\n')

  const enableBlacklist = _.uniq(
    levels.levels
      .slice(0, reduceIndex + 1)
      .map(r => r.disabledFiles)
      .flat()
  )

  await toggleMods(
    argv.cwd,
    'Enabling Mods',
    _.difference(alreadyDisabled, enableBlacklist),
    false
  )

  await toggleMods(
    argv.cwd,
    'Disabling Mods',
    _.uniq(
      levels.levels
        .slice(0, reduceIndex + 1)
        .map(r => r.files)
        .flat()
    ),
    true
  )

  exit()
}

export async function toggleMods(cwd: string, actionName: string, mods: string[], toDisable: boolean) {
  if (!mods.length) return

  const progressBar = terminal.progressBar({
    title   : actionName.padEnd(15),
    width   : 80,
    syncMode: true,
    items   : mods.length,
  })

  const updateBit = 1 / mods.length
  let progress = -updateBit

  const proms = Promise.all(mods.map(async (oldPath) => {
    const fileName = getFileName(oldPath)
    progressBar.startItem(fileName)

    const newPath = toDisable
      ? `${oldPath}.disabled`
      : oldPath.replace(/\.disabled$/, '')

    await rename(resolve(cwd, oldPath), resolve(cwd, newPath))

    progressBar.update(progress += updateBit)
  }))

  progressBar.update(1)
  terminal('\n\n')

  return await proms
}

init()
