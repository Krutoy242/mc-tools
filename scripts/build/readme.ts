/*

Generate README.md files for main repo and packages

*/

import { exec, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import chalk from 'chalk'
import fast_glob from 'fast-glob'
import fse from 'fs-extra'
import Handlebars from 'handlebars'

const execP = promisify(exec)

const { readJSONSync, writeFileSync, existsSync, removeSync } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const log = (str: any) => console.log(`${chalk.gray('█')} ${str}`)

// -------------------------------------------------------
// Main
// -------------------------------------------------------
const mainReadmePath = `README.md`
const mainReadmeContent = readFileSync(mainReadmePath, 'utf8')
const  mainReadmeUpdated = mainReadmeContent.replace(
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  /(?<pre><!--\s*eval:start\s*(?<code>[\s\S]*?)-->[\r\n]*)[\s\S]*?(?<post>[\r\n]*<!--\s*eval:end\s*-->)/g,
  (...match) => {
    const {pre, post, code} = match.pop()
    let output = ''
    try {
      // eslint-disable-next-line no-new-func
      output = new Function(
        'fast_glob',
        'fse',
        code.trim()
      )(fast_glob, fse)
    }
    catch (e) {
      log(`Error in block\n${code}\n\n${e}`)
    }
    return `${pre}${output}${post}`
  }
)

writeFileSync(mainReadmePath,  mainReadmeUpdated)

// -------------------------------------------------------
// Packages
// -------------------------------------------------------

const packages = fast_glob
  .sync('packages/*/package.json')
  .map(f => ({
    name   : parse(f).dir.split(/\/|\\/g).pop(),
    package: readJSONSync(f),
  }))

log(`Found ${chalk.green(packages.length)} packages`)

await Promise.all(fast_glob.sync('packages/*/README.md').map(handleReadme))

async function handleReadme(readmePath: string, i: number) {
  const readmeContent = readFileSync(readmePath, 'utf8')

  const extended_desc = readmeContent.match(
    /<!-- extended_desc -->([\s\S]*?)<!-- \/extended_desc -->/
  )?.[1] ?? ''

  const pkg = packages[i].package
  const pkgPath = `packages/${packages[i].name}`
  const cliPath = `${pkgPath}/src/cli.ts`
  const exist = existsSync(cliPath)
  const isCli = pkg.keywords.includes('cli') && exist

  log(`${isCli ? 'Executing' : 'Writing'} ${chalk.green(pkg.name)}${isCli ? chalk.green(' --help') : ''}`)
  const helpOutput = isCli
    ? (await execP(`tsx ${cliPath} --help`))
        .stdout
        .trim()
        .replace(`${process.cwd()}\\`, '') // remove relative paths
    : undefined

  const data = {
    package : pkg,
    packages: packages.filter((_, j) => j !== i),
    extended_desc,
    helpOutput,
  }

  Handlebars.registerHelper('includes', (obj: Array<any>, element: any) => obj.includes(element))

  const typedocCommand = `npx typedoc ${pkgPath}/src --out docs/${packages[i].name} --plugin typedoc-plugin-markdown --hideBreadcrumbs --hidePageTitle --hidePageHeader --disableSources --excludeInternal --readme none`
  Handlebars.registerHelper('typedoc', () => {
    log(chalk.rgb(20, 90, 10)('docs') + chalk.gray(` for ${packages[i].package.name}`))
    execSync(typedocCommand)
    const resultedDocs = fast_glob.sync(`docs/${packages[i].name}/*/*.md`).map(file => ({
      file,
      text: readFileSync(file, 'utf8')
        // .replace(/^# .+\n/gm, '')
        .replace(/^(#+) /gm, '#$1 '), // lower title level
    }))
    const groupped = {} as Record<string, typeof resultedDocs>
    resultedDocs.forEach((o) => {
      const splitted = o.file.split(/\/|\\/)
      ;(groupped[splitted[splitted.length - 2]] ??= []).push(o)
    })
    return Object.entries(groupped)
      .map(([group, list]) => `## ${group}\n\n${list
        .map(o => `### \`${o.file.split(/\/|\\/).pop()?.replace(/\..+$/, '')}\`\n\n${o.text}`)
        // .map(o => o.text)
        .join('\n')
      }`)
      .join('\n')
  })

  const builder = Handlebars.compile(readFileSync(relative('readme.hbs'), 'utf8'), { noEscape: true })
  const result = builder(data)

  writeFileSync(readmePath, result)
  log(chalk.gray(`done ${packages[i].package.name}`))
}

// Remove whole "docs/" folder
removeSync('docs')
