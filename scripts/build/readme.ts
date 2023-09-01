import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'node:path'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import fast_glob from 'fast-glob'
import Handlebars from 'handlebars'
import fse from 'fs-extra'
import chalk from 'chalk'

const execP = promisify(exec)

const { readJSONSync, writeFileSync, existsSync } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const log = (str: any) => console.log(`${chalk.gray('█')} ${str}`)

const packages = fast_glob
  .sync('packages/*/package.json', { dot: true })
  .map(f => ({
    name   : parse(f).dir.split(/\/|\\/g).pop(),
    package: readJSONSync(f),
  }))

log(`Found ${chalk.green(packages.length)} packages`)

fast_glob.sync('packages/*/README.md', { dot: true }).forEach(handleReadme)

async function handleReadme(readmePath: string, i: number) {
  const readmeContent = readFileSync(readmePath, 'utf8')

  const extended_desc = readmeContent.match(
    /<!-- extended_desc -->([\s\S\n]*?)<!-- \/extended_desc -->/m
  )?.[1] ?? ''

  const cliPath = `packages/${packages[i].name}/src/cli.ts`

  const exist = existsSync(cliPath)
  log(`${exist ? 'Executing' : 'Writing'} ${chalk.green(packages[i].package.name)}${exist ? chalk.green(' --help') : ''}`)
  const helpOutput = exist
    ? (await execP(`esno ${cliPath} --help`)).stdout.trim()
    : undefined

  const data = {
    package : packages[i].package,
    packages: packages.filter((_, j) => j !== i),
    extended_desc,
    helpOutput,
  }

  const builder = Handlebars.compile(readFileSync(relative('readme.hbs'), 'utf8'), { noEscape: true })
  const result = builder(data)

  writeFileSync(readmePath, result)
  log(chalk.gray(`done ${packages[i].package.name}`))
}
