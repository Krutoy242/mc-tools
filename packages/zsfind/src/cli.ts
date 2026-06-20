#!/usr/bin/env tsx

import type { Match } from './resolve.ts'
import type { Source } from './sources.ts'
import process from 'node:process'
import chalk from 'chalk'
import { defineCommand, runMain } from 'citty'
import consola from 'consola'
import { resolve } from 'pathe'
import { expandTypes, findMembers, parseDzs } from './dzs.ts'
import { resolveQuery, suggest } from './resolve.ts'
import { loadSources } from './sources.ts'

const MAX_FILE_LINES = 200
const MAX_SELECT = 12
const MAX_LIST = 25
const MAX_MEMBER_FILES = 8

function header(text: string) {
  console.log(chalk.bold.blue(`\n=== ${text} ===`))
}

function classLabel(m: Match): string {
  return `${m.source.label}: ${m.file}`
}

async function printClass(match: Match) {
  const { content } = await parseDzs(match.source, match.file)
  header(classLabel(match))
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  if (lines.length > MAX_FILE_LINES) {
    console.log(lines.slice(0, MAX_FILE_LINES).join('\n'))
    const full = resolve(match.source.root, match.file)
    console.log(chalk.yellow(`\n… and ${lines.length - MAX_FILE_LINES} more lines in ${full}`))
  }
  else {
    console.log(lines.join('\n'))
  }
}

async function printMember(match: Match, member: string, enqueue: (q: string) => void) {
  const { content, imports, classFullName } = await parseDzs(match.source, match.file)
  const members = findMembers(content, member)

  header(`${classLabel(match)} → ${member}`)
  if (members.length === 0) {
    consola.error(`Member "${member}" not found in ${classFullName}`)
    return
  }

  for (const m of members)
    console.log(chalk.green(expandTypes(m.raw, imports)))

  const fetched = new Set<string>()
  for (const m of members) {
    if (!m.returnType || fetched.has(m.returnType))
      continue
    fetched.add(m.returnType)
    const full = imports[m.returnType] ?? m.returnType
    consola.info(`${chalk.dim(`↳ returns ${m.returnType}; fetching ${full}`)}`)
    enqueue(full)
  }
}

function listMatches(matches: Match[]) {
  const shown = matches.slice(0, MAX_LIST)
  for (const m of shown)
    console.log(`  ${chalk.cyan(classLabel(m))}`)
  if (matches.length > shown.length)
    console.log(chalk.dim(`  … and ${matches.length - shown.length} more`))
  consola.info('Narrow it down with a path query, e.g. `some/package/Name` or `package.Name`.')
}

async function pickInteractive(query: string, matches: Match[]): Promise<Match | undefined> {
  const { isCancel, select } = await import('@clack/prompts')
  const selected = await select({
    message: `Multiple matches for "${query}". Choose one:`,
    options: matches.map(m => ({ value: m, label: classLabel(m) })),
  })
  if (isCancel(selected)) {
    consola.info('Cancelled.')
    return undefined
  }
  return selected
}

async function handleQuery(query: string, sources: Source[], enqueue: (q: string) => void) {
  const { matches, member, lastSeg } = await resolveQuery(query, sources)

  if (matches.length === 0) {
    consola.error(`"${query}" not found.`)
    const hints = suggest(lastSeg, sources)
    if (hints.length) {
      consola.info('Did you mean:')
      for (const h of hints)
        console.log(`  ${chalk.cyan(h.base)} ${chalk.dim(`(${h.source.label}: ${h.file})`)}`)
    }
    return
  }

  if (member) {
    if (matches.length > MAX_MEMBER_FILES) {
      consola.warn(`"${query}" matched ${matches.length} classes; showing the first ${MAX_MEMBER_FILES}.`)
    }
    for (const m of matches.slice(0, MAX_MEMBER_FILES))
      await printMember(m, member, enqueue)
    return
  }

  if (matches.length === 1) {
    await printClass(matches[0])
    return
  }

  if (process.stdout.isTTY && matches.length <= MAX_SELECT) {
    const chosen = await pickInteractive(query, matches)
    if (chosen)
      await printClass(chosen)
    return
  }

  consola.warn(`"${query}" matched ${matches.length} classes:`)
  listMatches(matches)
}

const main = defineCommand({
  meta: {
    name       : 'zsfind',
    description: 'Look up ZenScript class definitions, fields and method signatures '
      + 'across the CraftTweaker (ct-dump) and native (ct-dump-native) dumps.\n\n'
      + 'Queries accept:\n'
      + '  \u2022 a short name              IItemStack   EntityPlayer\n'
      + '  \u2022 a partial path            crafttweaker.item.IItemStack   net/minecraft/item/ItemStack\n'
      + '  \u2022 a member (field/method)   IItemStack.withTag   EntityPlayer.gameProfile\n'
      + '  \u2022 many at once              IItemStack.withTag IData.asString IBlockState',
  },
  args: {
    query  : { type: 'positional', required: false, description: 'Class, path or Class.member to look up (repeatable)' },
    reindex: { type: 'boolean', description: 'Rebuild the cached native file index' },
  },
  async run({ args }) {
    const queries = args._.map(String).filter(Boolean)
    if (queries.length === 0) {
      consola.error('Provide at least one class or member to look up. Run with --help for examples.')
      process.exitCode = 1
      return
    }

    const { sources, skipped } = await loadSources({ reindex: args.reindex })
    for (const s of skipped)
      consola.warn(`Skipping ${s.spec.label} dump (${s.reason}).`)
    if (sources.length === 0) {
      consola.error('No dumps available to search.')
      process.exitCode = 1
      return
    }

    const queue = [...queries]
    const seen = new Set<string>()
    while (queue.length) {
      const query = queue.shift()!
      if (seen.has(query))
        continue
      seen.add(query)
      await handleQuery(query, sources, (q) => {
        if (!seen.has(q))
          queue.push(q)
      })
    }
  },
})

void runMain(main)
