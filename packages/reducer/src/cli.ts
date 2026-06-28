#!/usr/bin/env tsx

import type { ArgsDef } from 'citty'
import { statSync } from 'node:fs'
import process from 'node:process'
import { assertPath } from '@mctools/utils/args'
import { defineCommand, runMain } from 'citty'
import { resolve } from 'pathe'

import pkg from '../package.json' with { type: 'json' }
import { runAction, runBinary, runFind, runKill, runRestart, runStatus } from './core/commands.js'
import { clearSession, readSession } from './session/lock.js'

const { description, name, version } = pkg

const SUBCOMMANDS = new Set(['restart', 'disable', 'enable', 'only', 'except', 'kill', 'find', 'status', 'binary'])

/** Flags that consume the following token as their value (for argv scanning). */
const VALUE_FLAGS = new Set(['-m', '--cwd', '-t', '--trusted', '-i', '--ignored'])

/** First non-flag token in `argv` and its index, or null. */
function firstPositional(argv: string[]): { token: string, index: number } | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') return argv[i + 1] !== undefined ? { token: argv[i + 1], index: i + 1 } : null
    if (a.startsWith('-')) {
      if (VALUE_FLAGS.has(a)) i++ // skip this flag's value
      continue
    }
    return { token: a, index: i }
  }
  return null
}

/** Best-effort cwd extraction from argv so we can resolve a config path. */
function cwdFromArgv(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-m' || a === '--cwd') return argv[i + 1] ?? './'
    const eq = a.match(/^--cwd=(.*)$/)
    if (eq) return eq[1]
  }
  return './'
}

/**
 * citty rejects an unknown leading positional, so the documented bare form
 * `mctools-reducer conditions.ts` can't reach our router. Detect a leading
 * positional that is an existing *file* and splice in the `binary` subcommand so
 * citty routes it correctly.
 */
function preprocessArgv(argv: string[]): string[] {
  const first = firstPositional(argv)
  if (!first || SUBCOMMANDS.has(first.token)) return argv
  // Prepend (not splice-in-place) so every flag lands *after* the subcommand and
  // is parsed against the `binary` command — otherwise leading flags like `-y`
  // would be swallowed by the parent and never reach the subcommand.
  if (asConfigFile(cwdFromArgv(argv), first.token)) return ['binary', ...argv]
  return argv
}

/** Positional args parsed by citty/mri. */
function positionals(args: Record<string, unknown>): string[] {
  const raw = (args as { _?: unknown })._
  return Array.isArray(raw) ? raw.map(String) : []
}

/** Normalize a citty string|string[] arg into a clean string[]. */
function listArg(v: unknown): string[] {
  if (v == null) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(String).filter(s => s !== '' && s !== 'true' && s !== 'false')
}

const cwdArg = {
  cwd: { type: 'string', alias: 'm', default: './', description: 'Minecraft dir with mods/ and minecraftinstance.json' },
} satisfies ArgsDef

const dryArg = {
  dry: { type: 'boolean', alias: 'y', description: 'Dry run: change no files/processes; log status as "assumed"' },
} satisfies ArgsDef

function mcPathOf(args: Record<string, unknown>): string {
  return assertPath(String(args.cwd ?? './'))
}

/** A real, existing config *file* (not a directory) → binary-search mode. */
function asConfigFile(mcPath: string, token: string | undefined): string | undefined {
  if (!token) return undefined
  for (const candidate of [resolve(token), resolve(mcPath, token)]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    }
    catch { /* not here */ }
  }
  return undefined
}

const restartCmd = defineCommand({
  meta: { name: 'restart', description: 'Restart Minecraft; optionally change the mod set first' },
  args: {
    ...cwdArg,
    ...dryArg,
    full   : { type: 'boolean', alias: 'F', description: 'Enable ALL mods before restarting' },
    disable: { type: 'string', alias: 'd', description: 'Disable these mods (+dependents); rest untouched' },
    enable : { type: 'string', alias: 'e', description: 'Enable these mods (+dependencies); rest untouched' },
    only   : { type: 'string', alias: 'o', description: 'Enable only these (+deps); disable everything else' },
    except : { type: 'string', alias: 'x', description: 'Disable these (+dependents); enable everything else' },
  },
  async run({ args }) {
    const mcPath = mcPathOf(args)
    const pos = positionals(args)
    const disable = listArg(args.disable)
    const enable = listArg(args.enable)
    const only = listArg(args.only)
    const except = listArg(args.except)
    const lists: [string, string[]][] = [['disable', disable], ['enable', enable], ['only', only], ['except', except]]
    const present = lists.filter(([, v]) => v.length > 0)

    // Fold trailing positionals into the single active mode (the documented
    // `restart --disable A B C` space form).
    if (!args.full && pos.length) {
      if (present.length === 1) {
        present[0][1].push(...pos)
      }
      else if (present.length === 0) {
        process.exitCode = fail('positional mods need a mode flag: --disable/--enable/--only/--except')
        return
      }
      else {
        process.exitCode = fail('cannot attribute positional mods to multiple mode flags — pass values inline (e.g. --disable A --enable B)')
        return
      }
    }

    process.exitCode = await runRestart({
      mcPath,
      dry : Boolean(args.dry),
      full: Boolean(args.full),
      disable,
      enable,
      only,
      except,
    })
  },
})

function verbCmd(kind: 'disable' | 'enable' | 'only' | 'except', desc: string) {
  return defineCommand({
    meta: { name: kind, description: desc },
    args: { ...cwdArg, ...dryArg },
    async run({ args }) {
      process.exitCode = await runAction({
        mcPath : mcPathOf(args),
        kind,
        queries: positionals(args),
        dry    : Boolean(args.dry),
        advise : true,
      })
    },
  })
}

const killCmd = defineCommand({
  meta: { name: 'kill', description: 'Kill the running Minecraft process for this instance' },
  args: { ...cwdArg, ...dryArg },
  async run({ args }) {
    process.exitCode = await runKill(mcPathOf(args), Boolean(args.dry))
  },
})

const findCmd = defineCommand({
  meta: { name: 'find', description: 'Resolve queries to ./mods/<jar> paths' },
  args: {
    ...cwdArg,
    dependencies: { type: 'boolean', alias: 'd', description: 'Also list each mod\'s dependency closure' },
    dependents  : { type: 'boolean', alias: 'u', description: 'Also list mods that depend on each match' },
  },
  async run({ args }) {
    process.exitCode = await runFind({
      mcPath      : mcPathOf(args),
      queries     : positionals(args),
      dependencies: Boolean(args.dependencies),
      dependents  : Boolean(args.dependents),
    })
  },
})

const statusCmd = defineCommand({
  meta: { name: 'status', description: 'Print the non-interactive dashboard (roster, diagnostics, weight)' },
  args: { ...cwdArg },
  async run({ args }) {
    process.exitCode = await runStatus(mcPathOf(args))
  },
})

const binaryArgs = {
  ...cwdArg,
  ...dryArg,
  force   : { type: 'boolean', alias: 'f', description: 'Ignore config validation problems' },
  continue: { type: 'boolean', alias: 'c', description: 'Resume a previously interrupted session' },
  new     : { type: 'boolean', alias: 'n', description: 'Discard an interrupted session and start fresh' },
  trusted : { type: 'string', alias: 't', description: 'Mods kept disabled (known-good)' },
  ignored : { type: 'string', alias: 'i', description: 'Mods kept enabled (untouched)' },
} satisfies ArgsDef

const binaryCmd = defineCommand({
  meta: { name: 'binary', description: 'Automated binary search via a conditions.{ts,mjs,js} file (also runs as the bare `reducer <config>` form)' },
  args: binaryArgs,
  async run({ args }) {
    const mcPath = mcPathOf(args)
    const config = positionals(args)[0]
    const configFile = config ? asConfigFile(mcPath, config) : undefined
    if (!configFile) {
      process.exitCode = fail(`conditions config not found: "${config ?? '<missing>'}"`)
      return
    }
    process.exitCode = await runBinary({
      mcPath,
      configPath: configFile,
      dry       : Boolean(args.dry),
      force     : Boolean(args.force),
      trusted   : listArg(args.trusted),
      ignored   : listArg(args.ignored),
      continue  : Boolean(args.continue),
      new       : Boolean(args.new),
    })
  },
})

const HELP_EXAMPLES = [
  '',
  'EXAMPLES',
  '  reducer                                  open the interactive TUI',
  '  reducer restart                          reboot MC, keep the current mod set',
  '  reducer restart --full                   reboot with every mod enabled',
  '  reducer restart --disable "Mod A" "Mod B"  disable mods (+dependents), then reboot',
  '  reducer restart --only "Mod A"           enable only Mod A (+deps), disable the rest',
  '  reducer restart --except "Mod A"         disable Mod A (+dependents), enable the rest',
  '  reducer restart --disable A --enable B   combined; refuses self-excluding requests',
  '  reducer disable "Mod A"                  change mods WITHOUT rebooting (⚠ prefer restart --disable)',
  '  reducer find jei thaum 1234              resolve queries → ./mods/<jar> paths',
  '  reducer find --dependencies "Mod A"      ...also list the dependency closure',
  '  reducer kill                             kill the running game',
  '  reducer status                           print roster / diagnostics / weight',
  '  reducer ./conditions.ts                  automated binary search (see below)',
  '  reducer --dry ./conditions.ts            simulate the search; report a culprit',
  '  reducer ./conditions.ts -t "Lib" -i "Mod"  trusted (kept off) / ignored (kept on)',
  '  reducer --continue / --new               resume / discard an interrupted session',
  '',
  'Add --dry/-y to any mutating command to log intended changes as "assumed"',
  'without touching files or processes.',
].join('\n')

const mainCli = defineCommand({
  meta: { name, version, description: `${description}\n${HELP_EXAMPLES}` },
  args: {
    ...cwdArg,
    ...dryArg,
    force   : { type: 'boolean', alias: 'f', description: 'Binary search: ignore config validation problems' },
    continue: { type: 'boolean', alias: 'c', description: 'Resume a previously interrupted session' },
    new     : { type: 'boolean', alias: 'n', description: 'Discard an interrupted session and start fresh' },
    trusted : { type: 'string', alias: 't', description: 'Binary search: mods kept disabled (known-good)' },
    ignored : { type: 'string', alias: 'i', description: 'Binary search: mods kept enabled (untouched)' },
  },
  subCommands: {
    restart: restartCmd,
    disable: verbCmd('disable', 'Disable mods without restarting (prefer `restart --disable`)'),
    enable : verbCmd('enable', 'Enable mods without restarting (prefer `restart --enable`)'),
    only   : verbCmd('only', 'Keep only these mods enabled, no restart (prefer `restart --only`)'),
    except : verbCmd('except', 'Disable only these mods, no restart (prefer `restart --except`)'),
    kill   : killCmd,
    find   : findCmd,
    status : statusCmd,
    binary : binaryCmd,
  },
  async run({ args }) {
    const pos = positionals(args)
    // citty also invokes this parent `run` when a subcommand matched; bail so we
    // don't re-handle the subcommand's name as a positional.
    if (pos[0] && SUBCOMMANDS.has(pos[0])) return

    const mcPath = mcPathOf(args)

    // `--continue` / `--new` without a config: act on the stored session.
    if (args.continue || args.new) {
      const prev = readSession(mcPath)
      if (args.new) {
        clearSession(mcPath)
        process.stdout.write('session cleared\n')
      }
      if (args.continue && prev?.binary) {
        process.exitCode = await runBinary({
          mcPath,
          configPath: prev.binary.configPath,
          dry       : Boolean(args.dry),
          force     : Boolean(args.force),
          trusted   : listArg(args.trusted),
          ignored   : listArg(args.ignored),
          continue  : true,
        })
        return
      }
      if (args.continue) {
        process.stdout.write('nothing to continue\n')
        return
      }
      if (args.new) {
        await launchTui(mcPath)
        return
      }
    }

    // No positionals → interactive TUI (React loaded lazily, never in CLI mode).
    await launchTui(mcPath)
  },
})

function fail(msg: string): number {
  process.stderr.write(`✘ ${msg}\n`)
  return 1
}

async function launchTui(mcPath: string): Promise<void> {
  const { main } = await import('./index.js')
  await main(mcPath)
}

void runMain(mainCli, { rawArgs: preprocessArgv(process.argv.slice(2)) })
