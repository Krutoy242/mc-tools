#!/usr/bin/env node

import type { Minecraftinstance } from '@mctools/curseforge/minecraftinstance'

import process from 'node:process'

import chalk from 'chalk'
import fse from 'fs-extra'
import yargs from 'yargs'

import { generateModsList } from '.'
import { assertPath } from '../../utils/src/args'

const { readFileSync, writeFileSync, readJsonSync } = fse

const args = (yargs(process.argv.slice(2))
  .scriptName('@mctools/modlist')
  .alias('h', 'help')
  .detectLocale(false)
  .strict()
  .version()
  .wrap(null)

  .option('key', {
    alias   : 'k',
    type    : 'string',
    describe: chalk.gray(`Path to file with CurseForge API key.
Get one at https://console.curseforge.com/?#/api-keys.
If omitted, environment variable \`CURSE_FORGE_API_KEY\` would be used instead.`),
    coerce: (f: string) => readFileSync(assertPath(f), 'utf8').trim(),
  }) as yargs.Argv<{ key: string }>)

  .option('ignore', {
    alias   : 'i',
    type    : 'string',
    describe: chalk.gray(`Path to ignore file similar to .gitignore.
Used to exclude mods that used only in dev environment and should not be included in mod list.
\`ignore\` file content example: "mods/tellme-*"`),
    coerce: (f: string) => readFileSync(assertPath(f), 'utf8'),
  })

  .option('mcinstance', {
    alias   : 'm',
    describe: chalk.gray(`Path to instance json.
This json file generates by CurseForge launcher.
It located at the root of Minecraft instance folder.`),
    default: 'minecraftinstance.json',
    coerce : (f: string) => readJsonSync(assertPath(f)) as Minecraftinstance,
  })

  .option('old', {
    alias   : 'l',
    describe: chalk.gray(`Path to old instance json to compare with.
This option is useful when you want to make changelog and compare two modpack versions.`),
    normalize: true,
    coerce   : (f: string) => readJsonSync(assertPath(f)) as Minecraftinstance,
  })

  .option('template', {
    alias   : 't',
    describe: chalk.gray(`Path to Handlebar template.
See \`default.hbs\` for more info.`),
    coerce: (f: string) => readFileSync(assertPath(f), 'utf8'),
  })

  .option('sort', {
    alias   : 's',
    describe: chalk.gray(`Sort field of CurseForge addon.
Accept deep path like \`cf2Addon.downloadCount\`.
\`/\` symbol at start of value flip sort order.`),
    default: 'addonID',
  })

  .option('output', {
    alias   : 'o',
    describe: chalk.gray('Path to output file.'),
    default : 'MODS.md',
  })

  .option('verbose', {
    alias   : 'v',
    type    : 'boolean',
    describe: chalk.gray('Log working process in stdout'),
  })

  .example(chalk.green`npx $0`, chalk.gray`If executed from minecraft folder, generate MODS.md file in same folder.
Environment must have variable CURSE_FORGE_API_KEY.`)
  .example(chalk.green`npx $0 --key=~secret_api_key.txt`, chalk.gray`Create mod list,
but take key from secret_api_key.txt file`)
  .example(chalk.green`npx $0 --ignore=devonly.ignore`, chalk.gray`Use .gitignore-like file to exclude mods,
that should not present in list.`)
  .example(chalk.green`npx $0 --mcinstance=mci.json`, chalk.gray`Generate mod list based non-default
named minecraftinstance.json file.`)
  .example(chalk.green`npx $0 --old=minecraftinstance_old.json`, chalk.gray`Generate comparsion of two modpacks / modpack versions.
Useful for generating modpack changelog.`)
  .example(chalk.green`npx $0 --template=fancy.hbs`, chalk.gray`Use custom template for generating list.
`)
  .example(chalk.green`npx $0 --sort=/cf2Addon.downloadCount`, chalk.gray`Sort mods in resulted list by their download count
instead of by default ID.`)
  .example(chalk.green`npx $0 --output=modlist.md`, chalk.gray`Rename output list instead of default MODS.md
`)
  .example(chalk.green`npx $0 --verbose`, chalk.gray`Write some information in terminal
`)

  .updateStrings(Object.fromEntries((
    ['Options:', 'Examples:']
      .map(w => [w, chalk.underline.bold(w)])
  )))

  .parseSync()

args.key ??= process.env.CURSE_FORGE_API_KEY as string

if (!args.key) {
  console.error(chalk.red`Provide Curse Forge API key with ` + chalk.yellow`--key` + chalk.red` cli option or with ` + chalk.yellow`CURSE_FORGE_API_KEY` + chalk.red` environment variable`)
  process.exit(1)
}

if (args.verbose) console.log('- Generating Modlist -')
generateModsList(
  args.mcinstance,
  args.old,
  args
).then(content => writeFileSync(args.output, content))
