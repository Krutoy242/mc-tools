/**
 * @file Generates changelogs based on git repo.
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

/*
██╗███╗   ███╗██████╗  ██████╗ ██████╗ ████████╗███████╗
██║████╗ ████║██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝
██║██╔████╔██║██████╔╝██║   ██║██████╔╝   ██║   ███████╗
██║██║╚██╔╝██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ╚════██║
██║██║ ╚═╝ ██║██║     ╚██████╔╝██║  ██║   ██║   ███████║
╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
*/

import { exec as _exec, execSync } from 'node:child_process'
import { URL, fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { readFileSync, writeFileSync } from 'fs-extra'
import _ from 'lodash'
import open from 'open'
import replace_in_file from 'replace-in-file'
import yargs from 'yargs'

import { fetchMods } from '../../utils/src/curseforge'
import { formatRow, getModsIds } from './automation/modsDiff.js'
import { generateManifest } from './lib/manifest.js'

/** @typedef {import('./lib/minecraftinstance').InstalledAddon} InstalledAddon */

function escapeRegex(str: string) {
  return str.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
}

const exec = promisify(_exec)

const argv = yargs(process.argv.slice(2))
  .option('next', {
    alias   : 'n',
    type    : 'string',
    describe: 'Next version',
  })
  .option('append', {
    alias   : 'a',
    type    : 'boolean',
    describe: 'Only append LATEST.md to CHANGELOG.md',
  })
  .parseSync()

function relative(relPath) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

/*
██╗   ██╗ █████╗ ██████╗ ██╗ █████╗ ██████╗ ██╗     ███████╗███████╗
██║   ██║██╔══██╗██╔══██╗██║██╔══██╗██╔══██╗██║     ██╔════╝██╔════╝
██║   ██║███████║██████╔╝██║███████║██████╔╝██║     █████╗  ███████╗
╚██╗ ██╔╝██╔══██║██╔══██╗██║██╔══██║██╔══██╗██║     ██╔══╝  ╚════██║
 ╚████╔╝ ██║  ██║██║  ██║██║██║  ██║██████╔╝███████╗███████╗███████║
  ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚══════╝
*/
const changelogLatest = 'changelogs/LATEST.md'
const changelogComplete = 'CHANGELOG.md'
const minecraftinstance_old = 'minecraftinstance_old.json'
const githubNotesPath = 'dev/release/~GitHub_notes.md'

/**
 * @typedef {Object} Subcategory
 * @property {string} symbol
 * @property {string[]} aliases
 * @property {boolean} [isBlacklisted]
 * @property {Subcategory[]} [subcategory]
 * */

/*
██╗███╗   ██╗██╗████████╗
██║████╗  ██║██║╚══██╔══╝
██║██╔██╗ ██║██║   ██║
██║██║╚██╗██║██║   ██║
██║██║ ╚████║██║   ██║
╚═╝╚═╝  ╚═══╝╚═╝   ╚═╝
*/
export async function init(h = defaultHelper) {
  if (argv.append)
    return h.result(`Appended: ${appendChangelog()}`)

  if (!argv.next)
    return h.error('Must provide --next version option')

  await h.begin('Determine version')

  // Get last tagged version
  const old_version = execSync('git describe --tags --abbrev=0')
    .toString()
    .trim()

  /** @type {string} */
  const nextVersion: string = argv.next
  await h.begin(`Version ${old_version} -> ${nextVersion} `)

  // Change version in files
  bumpVersionInFiles(nextVersion)

  /** @type {string[]} */
  const changelogLines: string[] = []

  changelogLines.push(
    ...(await getModChanges(old_version, nextVersion, h)).split('\n')
  )

  const commitMap = getCommitMap(old_version)

  const changelogStructure = parseChangelogStructure(
    readFileSync(relative('automation/data/changelog_structure.md'), 'utf8')
  )

  const blacklistedCategories = filterCommitMap(commitMap, changelogStructure)

  const { commitLogChanges, categoriesCount, unknownCommits }
    = await getCommitChangeLines(h, commitMap, changelogStructure)

  await h.begin('Writing in file')
  changelogLines.push(...commitLogChanges, '\n\n')
  writeFileSync(
    changelogLatest,
    [`# ${nextVersion}\n\n`, ...changelogLines].join('\n')
  )

  // Automatically assign icons
  await h.begin('Automatic iconisation')

  try {
    await runProcess(
      `esno E:/dev/mc-icons/src/cli.ts "${changelogLatest}" --silent --no-short --modpack=e2ee --treshold=2`,
      () => h.step()
    )
  }
  catch (error) {
    h.warn(`Unable to mc-icons over file ${changelogLatest}`)
  }

  // Manual Changelog fixing
  // await h.begin('Manually fix LATEST.md and close it.')
  await open(changelogLatest, { wait: true })
  // await h.done()

  h.result(
    `New changelog entries: ${categoriesCount}, `
      + `Unknown: ${unknownCommits}, `
      + `Blacklisted: ${blacklistedCategories}`
  )
}

if (
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href
)
  init()

/**
 * @param {typeof defaultHelper} h
 * @param {{[keySymbol: string]: string[]}} commitMap
 * @param {Subcategory[]} changelogStructure
 */
async function getCommitChangeLines(h: typeof defaultHelper, commitMap: { [keySymbol: string]: string[] }, changelogStructure: Subcategory[]) {
  /** @type {string[]} */
  const commitLogChanges: string[] = []

  // Iterate over defined list
  let categoriesCount = 0
  await h.begin('Annotating changes', Object.keys(commitMap).length)
  commitLogChanges.push(...stringifySubcatList(changelogStructure))

  /**
   *
   * @param {Subcategory[]} subCatList
   * @returns {string[]}
   */
  function stringifySubcatList(subCatList: Subcategory[] = [], level = 0): string[] {
    const result = subCatList.map(arr => stringifySubcat(arr, level)).flat()

    if (result.length) return [...result, '']
    return []
  }

  /**
   * Add information into resulting file text
   * @param {Subcategory} subCat
   * @returns {string[]} Lines of text
   */
  function stringifySubcat(subCat: Subcategory, level = 0): string[] {
    // Add own Entries
    let result
      = commitMap[subCat.symbol]
        ?.map(subject =>
          stringifyCommit(subject, subCat.aliases).map(
            s => `  ${s.replace(/\n/g, '\n  ')}`
          )
        )
        .flat() ?? []
    delete commitMap[subCat.symbol]

    // Add sub entries
    const subList = stringifySubcatList(subCat.subcategory, level + 1).map(
      s =>
        s
          .replace(/^((- )?#+)/, '$1#') // Add paragraph level
          .replace(/(.+)/g, '  $1') // Lift all content on +1 tab
    )
    result.push(...subList)

    // No content for category
    if (!result.length) return []

    // Lift subcategory up if there only one
    let mergedSingleMessage = ''
    if (
      level !== 0
      && _(result).sumBy(s => (/^ {2}- .*$/.test(s) ? 1 : 0)) === 1
    ) {
      mergedSingleMessage = result[0].replace(/^ {2}- /, ': ')
      result.splice(0, 1)
    }

    // Make item list in one line
    let lastLineIsItem = true
    _(result).forEachRight((line, i) => {
      lastLineIsItem &&= isItemCaptue(line.replace(/^\s*- /, ''))
      if (i !== result.length - 1 && lastLineIsItem)
        result[i + 1] = result[i + 1].replace(/^(\s*)- /, '$1  ')
    })

    result = [
      `- ## ${subCat.symbol} **${subCat.aliases[0]}**${mergedSingleMessage}`,
      ...result,
      '',
    ]

    h.step(subCat.symbol)
    categoriesCount++
    return result
  }

  // Iterate fields not mentioned in "annotations"
  let unknownCommits = 0
  for (const [key, arr] of Object.entries(commitMap)) {
    if (/\w+.*/.test(key)) unknownCommits++// continue // Skip commits started with words

    arr.forEach(() => {
      commitLogChanges.push(
        ...stringifySubcat({ symbol: key, aliases: ['❓❓'] })
      )
    })
  }

  // Remove top-level lists
  commitLogChanges.forEach(
    (l, i) => (commitLogChanges[i] = commitLogChanges[i].replace(/^- /, ''))
  )
  return { commitLogChanges, categoriesCount, unknownCommits }
}

/*
███╗   ███╗ ██████╗ ██████╗ ███████╗
████╗ ████║██╔═══██╗██╔══██╗██╔════╝
██╔████╔██║██║   ██║██║  ██║███████╗
██║╚██╔╝██║██║   ██║██║  ██║╚════██║
██║ ╚═╝ ██║╚██████╔╝██████╔╝███████║
╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
*/
async function getModChanges(version, nextVersion, h = defaultHelper) {
  // Extract old minecraftinstance.json (from latest assigned tag)
  execSync(
    `git show tags/${version}:minecraftinstance.json > ${minecraftinstance_old}`
  )

  const modsDiff = getModsIds(minecraftinstance_old, 'minecraftinstance.json')

  const counstGets = 0
  const promises = ['added', 'removed', 'updated'].map(group =>
    fetchMods(
      modsDiff[group].map(
        (/** @type {InstalledAddon} */ { addonID }: InstalledAddon) => addonID
      )
    )
  )

  await h.begin('Asking CurseForge', counstGets)
  const [added, removed, updated] = await Promise.all(promises)

  await h.begin('Generating text')
  const curseResult = { added, removed, updated }
  let result = ''
  for (const [group, message] of [
    ['added', '## 🟢 New Mods'],
    ['removed', '## 🔴 Removed Mods'],
    ['updated', '## 🟡 Updated Mods'],
  ]) {
    if (!curseResult[group].length) continue

    const isUpdated = group === 'updated'
    const rows = curseResult[group].map(curseAddon =>
      isUpdated
        ? `- **${curseAddon.name.trim()}**`
        : formatRow(modsDiff.map_union[curseAddon.id], curseAddon, {})
    )
    result += [
      message,
      '',
      ...(isUpdated
        ? ''
        : ['Icon | Summary | Reason', '----:|:--------| ------']),
      ...rows,
      '\n',
    ].join('\n')
  }

  await generateManifest(nextVersion)

  /*
  // Generate manifests for later use in changelog generator
  await generateManifest(version, minecraftinstance_old, '_old')

  h.begin('Retrieving mod detailed changelogs', 10)
  const nextModsChangelogsFile = `MODS_${nextVersion}.md`
  const nextModsChangelogsFull = `changelogs/${nextModsChangelogsFile}`
  const chgenCommand
    = '"D:/Program Files/Java/jdk-18/bin/java" -jar ModListCreator-4.0.3-fatjar.jar changelog'
    + ' --old="manifest_old.json"'
    + ' --new="manifest.json"'
    + ` --output=${nextModsChangelogsFull}`

  const chGenConsoleOut = (data) => {
    const projectID = data.match(/^.*projectID=(\d+)/)?.[1]
    h.begin(
      `Retrieving changelogs ${
        curseResult.updated.find(m => m.id === projectID)?.name
        ?? '[unknown mod]'
      }`
    )
  }

  let attemptsLeft = 2
  let chGenSucces = false
  while (!chGenSucces && attemptsLeft-- > 0) {
    try {
      await runProcess(chgenCommand, chGenConsoleOut)
      chGenSucces = true
    }
    catch (error) {
      if (attemptsLeft > 0) { h.warn('ChangelogGenerator fatal error. Trying again...') }
      else {
        h.error(`ChangelogGenerator cant do its work. Reason: ${error}`)
        return result
      }
    }
  }

  // Remove file if there is no changes at all
  if (readFileSync(nextModsChangelogsFull).split('\n').length <= 4) {
    unlink(nextModsChangelogsFull)
  }
  else {
    makeModsChangelogBetter(nextModsChangelogsFull)
    result += `\n## [> Mods updates detailed.](https://github.com/Krutoy242/Enigmatica2Expert-Extended/blob/master/changelogs/${nextModsChangelogsFile})\n\n`
  }
 */
  return result
}

/**
 * @param {string} nextModsChangelogsFull
 */
function makeModsChangelogBetter(nextModsChangelogsFull: string) {
  const newChangelogText = readFileSync(nextModsChangelogsFull)
    .replace(
      /(?<prefix>^####.*$)(?<body>([\s\S\n](?!\n##)){1,})/gim,
      (/** @type {any[]} */ ...args: any[]) => {
        /** @type {{[key:string]:string}} */
        const groups: { [key: string]: string } = args.pop()
        return `${groups.prefix}${groups.body.replace(/\n/g, '\n  > ')}`
      }
    )
    .replace(/^## (Added|Removed)[\s\n]+(\*\s[^\n]+\n)+/gim, '')

  writeFileSync(newChangelogText, nextModsChangelogsFull)
}

/*
██╗   ██╗████████╗██╗██╗     ███████╗
██║   ██║╚══██╔══╝██║██║     ██╔════╝
██║   ██║   ██║   ██║██║     ███████╗
██║   ██║   ██║   ██║██║     ╚════██║
╚██████╔╝   ██║   ██║███████╗███████║
 ╚═════╝    ╚═╝   ╚═╝╚══════╝╚══════╝
*/

/**
 * @param {string} fileText
 * @return {Subcategory[]} Category with optional {@link Subcategory}
 * */
function parseChangelogStructure(fileText: string): Subcategory[] {
  const jsCode = (`${fileText}\n\n`)
    // Comments
    .replace(/#.*$/gm, '')

    // Wrap as JS array
    .replace(
      /^([\t ]*)(x )?([^\t\n ]+)[\t ]+((?:[^\t\n ]+[\t ]*)+)$/gm,
      (m, tab, isBlacklisted, symbol, aliases) =>
        `${tab}{symbol:"${symbol}",aliases:"${aliases}",isBlacklisted:${!!isBlacklisted}},`
    )

    // Add subcategories
    .replace(
      /^(.symbol:.+)\},\n((?:^\s+.symbol.+\n)+?)(\s*\n|.symbol.+$)/gm,
      '$1,subcategory:[\n$2]},$3'
    )

    // Split aliases
    .replace(
      /aliases:"([^"]+)"/gm,
      (m, p) => `aliases:${JSON.stringify(p.split('|').map(s => s.trim()))}`
    )

  // eslint-disable-next-line no-eval
  return eval(`([${jsCode}])`)
}

/**
 * Remove excess characters from first commit line
 * @param {string} s
 * @param {string[]} aliases
 */
function trimAliases(s: string, aliases: string[]) {
  const aliasesJoined = aliases
    .map(s => escapeRegex(s).replace(/\s+/, '\\s*'))
    .join('|')
  const aliasRgx = new RegExp(
    `^(?:${aliasesJoined})(?:\\s*:)?\\s*([\\s\\S]*)$`,
    'i'
  )
  return s.replace(aliasRgx, '$1')
}

/**
 * @param {string} message
 */
function splitMessage(message: string) {
  return message
    .trim()
    .split(/\n(?!(\t| {2})\s*>\s+)/)
    .filter(s => s)
}

/**
 * @param {string} subject
 * @param {string[]} aliases
 */
function stringifyCommit(subject: string, aliases: string[]) {
  return splitMessage(subject).map(
    (l, i) => `${i === 0 ? '- ' : '  > '}${trimAliases(l, aliases)}`
  )
}

/**
 * Git log -> parse all log entries to get map
 * @param {string} version
 */
function getCommitMap(version: string) {
  const logFromLastTag = execSync(`git log ${version}..HEAD`).toString().trim()

  /** @type {{[keySymbol: string]: string[]}} */
  const commitMap: { [keySymbol: string]: string[] } = {}
  logFromLastTag.split(/^commit .*$/gm).forEach((commitBlock) => {
    const commitMatch = commitBlock.match(
      /^Author: .*?\nDate: .*?\n\n(?<message>.*)/ms
    )
    if (!commitMatch || !commitMatch.groups) return

    const [symbol, mesaage] = parseCommitMessage(
      commitMatch.groups.message.trim()
    )
    if (!symbol) return
    ;(commitMap[symbol] ??= []).push(mesaage ?? '')
  })

  return commitMap
}

/**
 * @param {string} commitMessage
 */
function parseCommitMessage(commitMessage: string) {
  const match = commitMessage.match(/^(?<symbol>[^a-zA-Z ]+) (?<subject>.+)/ms)
  const symbol = match?.groups?.symbol
  if (!match || !symbol?.trim()) return ['other', commitMessage]

  // Remove leading spaces frow commit message
  const trimmedSubject = match.groups?.subject
    .split('\n')
    .map(l => l.replace(/^ {4}/, ''))
    .filter((l, i) => l || i !== 1)
    .join('\n')

  return [symbol, trimmedSubject]
}

/**
 * Filter meaningless same entries
 * Split and merge commits on several ones if has same content
 *
 * @param {Object<string, string[]>} commitMap
 * @param {Subcategory[]} changelogStructure
 */
function filterCommitMap(commitMap: { [s: string]: string[] }, changelogStructure: Subcategory[]) {
  /** @type {Object<string, Subcategory>} */
  const flatStructure: { [s: string]: Subcategory } = {}

  /** @param {Subcategory[]} subCatList */
  function flattenSub(subCatList: Subcategory[]) {
    for (const subCat of subCatList) {
      flatStructure[subCat.symbol] = subCat
      if (subCat.subcategory) flattenSub(subCat.subcategory)
    }
  }
  flattenSub(changelogStructure)

  let blacklistedCommits = 0
  for (const [symbol, messages] of Object.entries(commitMap)) {
    // Unknown symbol
    const aliases = flatStructure[symbol]?.aliases
    if (!aliases?.length) continue

    // Symbol Blacklisted - remove it
    if (flatStructure[symbol].isBlacklisted) {
      delete commitMap[symbol]
      blacklistedCommits++
      continue
    }

    // Trim Category aliases and remove duplicates
    commitMap[symbol] = _(messages)
      .map(m => trimAliases(m, aliases))
      .filter(m => !!m)
      .uniqWith((a, b) => a === b)
      .value()

    // Split subcategories if one commit have several of them
    commitMap[symbol].forEach((message, i) => {
      if (!flatStructure[symbol].subcategory?.length) return

      const anySubcatName = flatStructure[symbol].subcategory
        ?.map(subcat => subcat.aliases)
        .flat()
        .map(escapeRegex)
        .join('|')

      const subMatchesRgx = new RegExp(
        `^(?:\\*\\*)?(?<subName>${anySubcatName}):?(?:\\*\\*)?:?\\s*`
          + `(?<content>${
            '('
            + '\n[-*]\\s.*' // Any list item
            + '(\n[^-*\\s].*)*' // Any wrapped text
            + '(\n(\t|  )+>\\s.*)*' // Any quoted text
            + ')+'
          })`,
        'gmi'
      )
      const subMatches = [...message.matchAll(subMatchesRgx)]

      subMatches.forEach((match) => {
        message = message.replace(match[0], '')
        const { subName, content } = match.groups

        const matchedSubcat = flatStructure[symbol].subcategory.find(sc =>
          new RegExp(`^${sc.aliases.join('|')}$`, 'i').test(subName)
        )

        ;(commitMap[matchedSubcat.symbol] ??= []).push(
          ...splitMessage(content).map(l => l.replace(/^[-*]\s/, ''))
        )
      })

      commitMap[symbol][i] = message
    })

    // Remove empty messages
    commitMap[symbol] = commitMap[symbol].filter(
      l => !new RegExp(`^((${aliases.join('|')}):?)?\\s*$`).test(l)
    )
  }

  // Sort lists of icons
  _(commitMap).forEach(arr =>
    arr.sort((a, b) => {
      const getWeight = s => (isItemCaptue(s) ? 0 : 1)
      return getWeight(b) - getWeight(a)
    })
  )

  // If commit content only list, lift this list up
  _(commitMap).forEachRight((arr, symbol) =>
    _(arr).forEachRight((message, i) => {
      if (!flatStructure[symbol]?.aliases) return
      const trimmed = trimAliases(message, flatStructure[symbol]?.aliases)
      const match = trimmed.match(/^([-*]\s+([\s\S](?!\n(\n| {2}|-|\*)))+.\n?)+$/)
      if (!match) return
      arr.splice(i, 1, ...trimmed.split(/\s*-\s*/).filter(s => s))
    })
  )

  return blacklistedCommits
}

function isItemCaptue(s) {
  return /^\[[^\]]+\](\s\([^)]+\))?$/.test(s)
}

/**
 * @param {string} command
 * @param {(chunk: any) => void} onStdOut
 */
function runProcess(command: string, onStdOut: (chunk: any) => void) {
  const promise = exec(command)
  promise.child.stdout?.on('data', onStdOut)
  return promise
}

/**
 * @param {string} nextVersion
 */
function bumpVersionInFiles(nextVersion: string) {
  replace_in_file.sync({
    files: 'config/CustomMainMenu/mainmenu.json',
    from : /("version_num"\s*:[\s\n]*\{[\s\n]*"text"\s*:\s*")[^"]+?(")/m,
    to   : `$1${nextVersion}$2`,
  })

  writeFileSync(nextVersion, 'dev/version.txt')
}

function appendChangelog() {
  // Determine current version
  const chLogLatestText = readFileSync(changelogLatest)
  const latestVersion = chLogLatestText.match(/^# (.+)\n/m)[1].trim()

  const chLogCmplteText = readFileSync(changelogComplete)
  const headerMatch = chLogCmplteText.match(/([\s\S\n]+?)^# /m)
  const header = headerMatch[1]

  let isReplaced = false
  const blocks = [
    ...chLogCmplteText.matchAll(/^# (.+)(\n([\s\S\n](?!^# ))+)/gm),
  ]
    .map(m => m.slice(1, 3))
    .filter(([version]) => {
      const isLatest = version.trim() !== latestVersion
      if (isLatest) isReplaced = true
      return isLatest
    })
  // .slice(0, 15) // Cut changelog entries

  const newChLog
    = header
    + chLogLatestText
    + blocks.map(([version, block]) => `# ${version}${block}`).join('\n')

  writeFileSync(newChLog, changelogComplete)

  // GitHub release notes
  writeFileSync(
    chLogLatestText.replace(
      /^# .+(\n[\s\n]*)/m,
      `${readFileSync('dev/release/GitHub_release_header.md')}$1`
    ),
    githubNotesPath
  )

  return isReplaced ? 'Latest was replaced' : 'Latest was added'
}
