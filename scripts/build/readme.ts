import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'node:path'
import { promisify } from 'node:util'
import { exec, execSync } from 'node:child_process'
import fast_glob from 'fast-glob'
import Handlebars from 'handlebars'
import fse from 'fs-extra'
import chalk from 'chalk'

const execP = promisify(exec)

const { readJSONSync, writeFileSync, existsSync, unlinkSync } = fse

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

// Remove whole "docs/" folder
unlinkSync('docs')

async function handleReadme(readmePath: string, i: number) {
  const readmeContent = readFileSync(readmePath, 'utf8')

  const extended_desc = readmeContent.match(
    /<!-- extended_desc -->([\s\S\n]*?)<!-- \/extended_desc -->/m
  )?.[1] ?? ''

  const pkg = packages[i].package
  const pkgPath = `packages/${packages[i].name}`
  const cliPath = `${pkgPath}/src/cli.ts`
  const exist = existsSync(cliPath)
  const isCli = pkg.keywords.includes('cli') && exist

  log(`${isCli ? 'Executing' : 'Writing'} ${chalk.green(pkg.name)}${isCli ? chalk.green(' --help') : ''}`)
  const helpOutput = isCli
    ? (await execP(`esno ${cliPath} --help`)).stdout.trim()
    : undefined

  const data = {
    package : pkg,
    packages: packages.filter((_, j) => j !== i),
    extended_desc,
    helpOutput,
  }

  Handlebars.registerHelper('includes', (obj: Array<any>, element: any) => obj.includes(element))

  const typedocCommand = `npx typedoc ${pkgPath}/src --out docs/${packages[i].name} --plugin typedoc-plugin-markdown --hideBreadcrumbs --hideInPageTOC --disableSources --githubPages false --excludeInternal`
  Handlebars.registerHelper('typedoc', () => {
    log(chalk.rgb(20, 90, 10)('docs') + chalk.gray(` for ${packages[i].package.name}`))
    execSync(typedocCommand)
    return readFileSync(`docs/${packages[i].name}/modules.md`, 'utf8')
      .replace(/^# .+\n/gm, '')
      .replace(/^(#+) /gm, '#$1 ')
  })

  const builder = Handlebars.compile(readFileSync(relative('readme.hbs'), 'utf8'), { noEscape: true })
  const result = builder(data)

  writeFileSync(readmePath, result)
  log(chalk.gray(`done ${packages[i].package.name}`))
}
