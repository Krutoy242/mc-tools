import yargs from 'yargs'
import fse from 'fs-extra'
import type { Minecraftinstance } from '@mct/curseforge/minecraftinstance'
import chalk from 'chalk'
import { assertPath } from '../../utils/src/args'
import { generateModsList } from '.'

const { readFileSync, writeFileSync, readJsonSync } = fse

const args = (yargs(process.argv.slice(2))
  .scriptName('@mct/modlist')
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

// .example(chalk.green('npx $0 something'), chalk.gray('Do something'))

  .updateStrings(Object.fromEntries((
    ['Options:', 'Examples:']
      .map(w => [w, chalk.underline.bold(w)])
  )))

  .parseSync()

args.key ??= process.env.CURSE_FORGE_API_KEY as string

if (!args.key)
  throw new Error('Provide Curse Forge API key with --key cli option or with CURSE_FORGE_API_KEY')

if (args.verbose) console.log('- Generating Modlist -')
generateModsList(
  args.mcinstance,
  args.old,
  args
).then(content => writeFileSync(args.output, content))
