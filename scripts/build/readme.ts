/*

Generate README.md files for main repo and packages

*/

import { exec } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import chalk from 'chalk'
import { stripAnsi } from 'consola/utils'
import fast_glob from 'fast-glob'
import fse from 'fs-extra'
import Handlebars from 'handlebars'

const execP = promisify(exec)

const { readJSON, existsSync, remove } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const log = (str: any) => console.log(`${chalk.gray('█')} ${str}`)

// -------------------------------------------------------
// Main
// -------------------------------------------------------
const mainReadmePath = `README.md`
const mainReadmeContent = await readFile(mainReadmePath, 'utf8')
const mainReadmeUpdated = mainReadmeContent.replace(
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  /(?<pre><!--\s*eval:start\s*(?<code>[\s\S]*?)-->[\r\n]*)[\s\S]*?(?<post>[\r\n]*<!--\s*eval:end\s*-->)/g,
  (...match: any[]) => {
    const { pre, post, code } = match.pop() as { pre: string, post: string, code: string }
    let output = ''
    try {
      const _Func: any = Function
      // eslint-disable-next-line ts/no-unsafe-call, ts/no-unsafe-assignment
      output = (new _Func(
        'fast_glob',
        'fse',
        String(code).trim()
      ))(fast_glob, fse)
    }
    catch (e) {
      log(`Error in block\n${code}\n\n${String(e)}`)
    }
    return `${pre}${output}${post}`
  }
)

await writeFile(mainReadmePath, mainReadmeUpdated)

// -------------------------------------------------------
// Packages
// -------------------------------------------------------

const packagePaths = await fast_glob('packages/*/package.json')
const packagesInfo = await Promise.all(packagePaths.map(async f => ({
  dir    : parse(f).dir,
  name   : parse(f).dir.split(/\/|\\/).pop(),
  package: (await readJSON(f)) as { name: string, keywords: string[], private?: boolean, description?: string, homepage?: string },
})))

log(`Found ${chalk.green(packagesInfo.length)} packages`)

const templateString = await readFile(relative('readme.hbs'), 'utf8')
const builder = Handlebars.compile(templateString, { noEscape: true })

await Promise.all(packagesInfo.map(async (pkgInfo) => {
  const readmePath = `${pkgInfo.dir}/README.md`
  if (!existsSync(readmePath)) return

  const readmeContent = await readFile(readmePath, 'utf8')

  const extended_desc = readmeContent.match(
    /<!-- extended_desc -->([\s\S]*?)<!-- \/extended_desc -->/
  )?.[1] ?? ''

  const pkg = pkgInfo.package
  const pkgPath = pkgInfo.dir
  const cliPath = `${pkgPath}/src/cli.ts`
  const exist = existsSync(cliPath)
  const isCli = pkg.keywords?.includes('cli') && exist

  log(`${isCli ? 'Executing' : 'Writing'} ${chalk.green(pkgInfo.name)}${isCli ? chalk.green(' --help') : ''}`)
  const helpOutput = isCli
    ? stripAnsi((await execP(`tsx ${cliPath} --help`))
        .stdout
        .trim())
        .replace(`${process.cwd()}\\`, '') // remove relative paths
    : undefined

  let typedocMarkdown = ''
  if (pkg.keywords?.includes('lib')) {
    log(chalk.rgb(20, 90, 10)('docs') + chalk.gray(` for ${pkg.name}`))
    const typedocCommand = `pnpm exec typedoc ${pkgPath}/src --out docs/${pkgInfo.name} --plugin typedoc-plugin-markdown --hideBreadcrumbs --hidePageTitle --hidePageHeader --disableSources --excludeInternal --readme none`
    await execP(typedocCommand)

    const resultedDocs = await fast_glob(`docs/${pkgInfo.name}/*/*.md`)
    const docsWithText = await Promise.all(resultedDocs.map(async file => ({
      file,
      text: (await readFile(file, 'utf8'))
        .replace(/^(#+) /gm, '#$1 '), // lower title level
    })))

    const groupped = {} as Record<string, typeof docsWithText>
    docsWithText.forEach((o) => {
      const splitted = o.file.split(/\/|\\/)
      ;(groupped[splitted[splitted.length - 2]] ??= []).push(o)
    })
    typedocMarkdown = Object.entries(groupped)
      .map(([group, list]) => `## ${group}\n\n${list
        .map(o => `### \`${o.file.split(/\/|\\/).pop()?.replace(/\..+$/, '')}\`\n\n${o.text}`)
        .join('\n')
      }`)
      .join('\n')
  }

  const data = {
    package : pkg,
    packages: packagesInfo,
    extended_desc,
    helpOutput,
    typedoc : typedocMarkdown,
  }

  const result = builder(data, {
    helpers: {
      includes: (obj: Array<any> | undefined, element: any) => obj?.includes(element) || false,
    },
  })

  await writeFile(readmePath, result)
  log(chalk.gray(`done ${pkg.name}`))
}))

// Remove whole "docs/" folder
await remove('docs')
