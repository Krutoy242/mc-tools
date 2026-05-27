/*

Generate README.md files for main repo and packages

*/

import { exec } from 'node:child_process'
import { createHash } from 'node:crypto'
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

const { readJSON, existsSync, remove, ensureDir } = fse

function relative(relPath: string) {
  return fileURLToPath(new URL(relPath, import.meta.url))
}

const timers = new Map<string, number>()
function _startTimer(id: string) {
  timers.set(id, performance.now())
}
function getTimer(id: string) {
  const start = timers.get(id)
  if (!start) return ''
  const elapsed = Math.round(performance.now() - start)
  return chalk.gray(` (${elapsed}ms)`)
}
const log = (id: string, str: any) => console.log(`${chalk.gray('█')} ${str}${getTimer(id)}`)

// -------------------------------------------------------
// Main
// -------------------------------------------------------
_startTimer('main-readme')
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
      output = new _Func(
        'fast_glob',
        'fse',
        String(code).trim()
      )(fast_glob, fse)
    }
    catch (e) {
      log('main-error', `Error in block\n${code}\n\n${String(e)}`)
    }
    return `${pre}${output}${post}`
  }
)

await writeFile(mainReadmePath, mainReadmeUpdated)
log('main-readme', 'Main README updated')

// -------------------------------------------------------
// Packages
// -------------------------------------------------------

_startTimer('scan-packages')
const packagePaths = await fast_glob('packages/*/package.json')
const packagesInfo = await Promise.all(packagePaths.map(async f => ({
  dir    : parse(f).dir,
  name   : parse(f).dir.split(/\/|\\/).pop(),
  package: (await readJSON(f)) as { name: string, keywords: string[], private?: boolean, description?: string, homepage?: string },
})))
log('scan-packages', `Found ${chalk.green(packagesInfo.length)} packages`)

function compactifyFunctionDoc(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trimStart() === '### Parameters') {
      i++
      while (i < lines.length && lines[i].trim() === '') i++

      const params: string[] = []
      while (i < lines.length && !lines[i].startsWith('### ')) {
        if (lines[i].startsWith('#### ')) {
          const name = lines[i].replace('#### ', '').trim()
          i++
          while (i < lines.length && lines[i].trim() === '') i++
          const type = lines[i]?.trim() || ''
          i++
          while (i < lines.length && lines[i].trim() === '') i++
          const descLines: string[] = []
          while (i < lines.length && !lines[i].startsWith('#### ') && !lines[i].startsWith('### ')) {
            if (lines[i].trim() !== '') descLines.push(lines[i].trim())
            i++
          }
          const desc = descLines.join(' ')
          params.push(`- \`${name}\` ${type}${desc ? ` — ${desc}` : ''}`)
        }
        else {
          i++
        }
      }

      if (params.length > 0) result.push(...params)
    }
    else if (line.trimStart() === '### Returns') {
      i++
      while (i < lines.length && lines[i].trim() === '') i++
      const type = lines[i]?.trim() || ''
      i++
      while (i < lines.length && lines[i].trim() === '') i++
      const descLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('### ')) {
        if (lines[i].trim() !== '') descLines.push(lines[i].trim())
        i++
      }
      const desc = descLines.join(' ')
      result.push(`\n**Returns:** ${type}${desc ? ` — ${desc}` : ''}`)
    }
    else {
      result.push(line)
      i++
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n')
}

const templateString = await readFile(relative('readme.hbs'), 'utf8')
const builder = Handlebars.compile(templateString, { noEscape: true })

// ---- Phase 1: Parallel prep ----
const libPackages = packagesInfo.filter(p => p.package.keywords?.includes('lib'))
const cliPackages = packagesInfo.filter(p => p.package.keywords?.includes('cli') && existsSync(`${p.dir}/src/cli.ts`))

// Phase 1a: Generate all TypeDoc docs in parallel
_startTimer('typedoc-all')
log('typedoc-all', `Generating docs for ${libPackages.length} packages in parallel`)

const cacheDir = '.cache/readme-build'
await ensureDir(cacheDir)

function getCacheFile(name: string, content: string): string {
  const cacheKey = createHash('sha256')
    .update(name + content)
    .digest('hex')
  return `${cacheDir}/${cacheKey}`
}

async function getCachedDocs(pkgInfo: typeof libPackages[0]): Promise<string> {
  const pkgPath = pkgInfo.dir
  const cacheFile = getCacheFile(`${pkgInfo.name}-typedoc`, JSON.stringify(pkgInfo.package))

  if (existsSync(cacheFile)) {
    return readFile(cacheFile, 'utf8')
  }

  const typedocCommand = `pnpm exec typedoc ${pkgPath}/src/index.ts --out docs/${pkgInfo.name} --plugin typedoc-plugin-markdown --hideBreadcrumbs --hidePageTitle --hidePageHeader --disableSources --excludeInternal --readme none --exclude '**/*.test.ts' --exclude '**/*.spec.ts' --skipErrorChecking --logLevel Error --excludeExternals`
  await execP(typedocCommand)

  const resultedDocs = await fast_glob(`docs/${pkgInfo.name}/*/*.md`)
  const docsWithText = await Promise.all(resultedDocs.map(async (file) => {
    let text = (await readFile(file, 'utf8'))
      .replace(/^(#+) /gm, '#$1 ') // lower title level

    const isFunctionDoc = file.includes('/functions/') || file.includes('\\functions\\')
    if (isFunctionDoc) {
      text = compactifyFunctionDoc(text)
    }

    return { file, text }
  }))

  const groupped = {} as Record<string, typeof docsWithText>
  docsWithText.forEach((o) => {
    const splitted = o.file.split(/\/|\\/)
    ;(groupped[splitted[splitted.length - 2]] ??= []).push(o)
  })

  const typedocMarkdown = Object.entries(groupped)
    .filter(([group]) => !['interfaces', 'type-aliases'].includes(group))
    .map(([group, list]) => `## ${group}\n\n${list
      .map(o => `### \`${o.file.split(/\/|\\/).pop()?.replace(/\..+$/, '')}\`\n\n${o.text}`)
      .join('\n\n')
    }`)
    .join('\n')

  await writeFile(cacheFile, typedocMarkdown)
  return typedocMarkdown
}

const typedocResults = await Promise.all(
  libPackages.map(async (pkgInfo) => {
    const timerId = `typedoc-${pkgInfo.name}`
    _startTimer(timerId)
    const markdown = await getCachedDocs(pkgInfo)
    log(timerId, chalk.rgb(20, 90, 10)('docs') + chalk.gray(` for ${pkgInfo.name}`))
    return { name: pkgInfo.name, markdown }
  })
)
log('typedoc-all', 'All docs generated')

const typedocMap = new Map(typedocResults.map(r => [r.name, r.markdown]))

// Phase 1b: Fetch all --help outputs in parallel
_startTimer('cli-all')

async function getCachedHelp(pkgInfo: typeof cliPackages[0]): Promise<string> {
  const cliPath = `${pkgInfo.dir}/src/cli.ts`
  const cliStat = await readFile(cliPath, 'utf8').catch(() => '')
  const cacheFile = getCacheFile(`${pkgInfo.name}-help`, cliStat)

  if (existsSync(cacheFile)) {
    return readFile(cacheFile, 'utf8')
  }

  const helpOutput = stripAnsi((await execP(`tsx ${cliPath} --help`))
    .stdout
    .trim())
    .replace(`${process.cwd()}\\`, '') // remove relative paths

  await writeFile(cacheFile, helpOutput)
  return helpOutput
}

const helpResults = await Promise.all(
  cliPackages.map(async (pkgInfo) => {
    const timerId = `cli-${pkgInfo.name}`
    _startTimer(timerId)
    const helpOutput = await getCachedHelp(pkgInfo)
    log(timerId, `Fetched --help for ${pkgInfo.name}`)
    return { name: pkgInfo.name, helpOutput }
  })
)
log('cli-all', 'All CLI help fetched')

const helpMap = new Map(helpResults.map(r => [r.name, r.helpOutput]))

// ---- Phase 2: Build all READMEs in parallel ----
_startTimer('readme-all')
await Promise.all(packagesInfo.map(async (pkgInfo) => {
  const pkgTimerId = `pkg-${pkgInfo.name}`
  _startTimer(pkgTimerId)

  const readmePath = `${pkgInfo.dir}/README.md`
  if (!existsSync(readmePath)) {
    log(pkgTimerId, chalk.gray(`skip ${pkgInfo.name} (no README)`))
    return
  }

  const readmeContent = await readFile(readmePath, 'utf8')
  const extended_desc = readmeContent.match(
    /<!-- extended_desc -->([\s\S]*?)<!-- \/extended_desc -->/
  )?.[1] ?? ''

  const pkg = pkgInfo.package
  const isCli = pkg.keywords?.includes('cli') && existsSync(`${pkgInfo.dir}/src/cli.ts`)

  if (isCli) {
    log(pkgTimerId, `Executing ${chalk.green(pkgInfo.name)}${chalk.green(' --help')}`)
  }
  else {
    log(pkgTimerId, `Writing ${chalk.green(pkgInfo.name)}`)
  }

  const data = {
    package   : pkg,
    packages  : packagesInfo,
    extended_desc,
    helpOutput: helpMap.get(pkgInfo.name),
    typedoc   : typedocMap.get(pkgInfo.name) ?? '',
  }

  const result = builder(data, {
    helpers: {
      includes: (obj: Array<any> | undefined, element: any) => obj?.includes(element) || false,
    },
  })

  await writeFile(readmePath, result)
  log(pkgTimerId, chalk.gray(`done ${pkgInfo.name}`))
}))
log('readme-all', 'All READMEs written')

// Remove whole "docs/" folder
_startTimer('cleanup')
await remove('docs')
log('cleanup', 'Removed docs/ folder')
