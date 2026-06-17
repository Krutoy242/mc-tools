import type { Ctx, InstanceAddon, MinecraftInstance } from './types.js'
import { fetchMod, fetchMods } from '@mctools/curseforge'
import chalk from 'chalk'
import { join } from 'pathe'
import { cloneRepo, execAsync, verifySourceFolder } from './git.js'
import { addonAuthor, findAddon } from './instance.js'
import { readJarManifest, readJarMcmodInfo } from './jar.js'

const GIT_HOST = /github\.com|gitlab\.com/

function stripUrl(url: string): string {
  return url.replace(/\/-\/.*$/, '').replace(/\/issues.*$/, '').replace(/\/$/, '')
}

/** Clone `repoUrl` into a folder named after `name` and verify it. */
async function cloneAndVerify(repoUrl: string, name: string, ctx: Ctx): Promise<string | null> {
  const targetDir = join(ctx.modSources, name.replace(/[^\w-]/g, ''))
  try {
    await cloneRepo(repoUrl, targetDir, ctx.log)
    if (await verifySourceFolder(targetDir, ctx.log)) return targetDir
    ctx.log(chalk.red('Cloned repository does not have enough .java files.'))
  }
  catch (e) {
    ctx.log(chalk.red(`Failed to clone ${repoUrl}: ${e instanceof Error ? e.message : String(e)}`))
  }
  return null
}

/** Name-similarity score of a repo against a query (0 = no relation). */
function baseScore(repoName: string, query: string, description?: string): number {
  const ql = query.toLowerCase()
  const qc = ql.replace(/[^a-z0-9]/g, '')
  const rn = repoName.toLowerCase()
  const rc = rn.replace(/[^a-z0-9]/g, '')
  let s = 0
  if (rn === ql) s += 100
  if (rc === qc) s += 80
  if (rc.includes(qc) || qc.includes(rc)) s += 50
  if (description?.toLowerCase().includes(ql)) s += 10
  return s
}

/**
 * Resolve a GitHub/GitLab repo URL for an addon via its `issuesURL`, then the
 * CurseForge API (`sourceUrl`/`issuesUrl`). Returns a cleaned URL or `null`.
 */
export async function getRepoUrl(addon: InstanceAddon, ctx: Ctx): Promise<string | null> {
  let repoUrl = addon.issuesURL && GIT_HOST.test(addon.issuesURL) ? addon.issuesURL : undefined

  if (!repoUrl) {
    ctx.log(chalk.gray(`No direct repo URL for '${addon.name}'. Checking CurseForge API...`))
    if (!ctx.cfApiKey) {
      ctx.log(chalk.yellow('Warning: set CF_API_KEY to enable CurseForge lookups.'))
    }
    else {
      try {
        const cfMod = await fetchMod(addon.addonID, ctx.cfApiKey)
        const candidate = cfMod?.links?.sourceUrl || cfMod?.links?.issuesUrl
        if (candidate && GIT_HOST.test(candidate)) {
          repoUrl = candidate
          ctx.log(chalk.green(`Found via CF API: ${repoUrl}`))
        }
      }
      catch (e) {
        ctx.log(chalk.red(`CurseForge API lookup failed: ${e instanceof Error ? e.message : String(e)}`))
      }
    }
  }

  return repoUrl && GIT_HOST.test(repoUrl) ? stripUrl(repoUrl) : null
}

/** Run `gh repo list` for each owner, then clone the best-scoring match. */
async function searchOwnersForRepo(owners: string[], query: string, ctx: Ctx): Promise<string | null> {
  for (const owner of [...new Set(owners)]) {
    ctx.log(chalk.gray(`Listing repos for GitHub user '${owner}'...`))
    try {
      const repos = JSON.parse(
        (await execAsync(`gh repo list "${owner}" --limit 100 --json name,url,description`)).stdout
      ) as { name: string, url: string, description?: string }[]

      const best = repos
        .map(r => ({ ...r, score: baseScore(r.name, query, r.description) }))
        .sort((a, b) => b.score - a.score)[0]

      if (best && best.score > 0) {
        ctx.log(chalk.green(`Best match in '${owner}': ${best.name} (score: ${best.score})`))
        const cloned = await cloneAndVerify(best.url, best.name, ctx)
        if (cloned) return cloned
      }
    }
    catch (e) {
      ctx.log(chalk.yellow(`Failed to list repos for '${owner}': ${e instanceof Error ? e.message : String(e)}`))
    }
  }
  return null
}

/** Broad/owner-scoped `gh search repos`, then clone the best-scoring match. */
async function searchGhAndClone(query: string, ownerHint: string | undefined, displayName: string, ctx: Ctx): Promise<string | null> {
  interface Repo { fullName: string, url: string, description?: string }
  let results: Repo[] = []

  const trySearch = async (extra: string) => {
    try {
      return JSON.parse((await execAsync(`gh search repos "${query}" ${extra} --limit 20 --json fullName,url,description`)).stdout) as Repo[]
    }
    catch {
      return []
    }
  }

  if (ownerHint) {
    results = await trySearch(`"user:${ownerHint}"`)
    if (results.length === 0) results = await trySearch(`"org:${ownerHint}"`)
  }
  if (results.length === 0) {
    ctx.log(chalk.gray('  broad GitHub search...'))
    results = await trySearch('')
  }
  if (results.length === 0) {
    ctx.log(chalk.yellow('  no repositories found.'))
    return null
  }

  const scored = results.map((r) => {
    const repoName = r.fullName.split('/')[1]
    let score = baseScore(repoName, query, r.description)
    if (ownerHint && r.fullName.toLowerCase().startsWith(`${ownerHint.toLowerCase()}/`)) score += 40
    if (/minecraft|forge/i.test(r.description || '')) score += 5
    return { ...r, score }
  }).sort((a, b) => b.score - a.score)

  ctx.log(chalk.gray(`  best match: ${scored[0].fullName} (score: ${scored[0].score})`))
  if (scored[0].score > 0) {
    return cloneAndVerify(scored[0].url, displayName || scored[0].fullName.split('/')[1], ctx)
  }
  return null
}

/**
 * Read the mod's jar metadata (`mcmod.info`, then `MANIFEST.MF`) for a GitHub
 * URL; clone it if found, otherwise fall back to a GitHub search by author /
 * name.
 */
export async function findRepoFromJar(query: string, jarPath: string, displayName: string, ctx: Ctx): Promise<string | null> {
  ctx.log(chalk.cyan(`Searching jar metadata for GitHub repository (${jarPath})...`))

  let githubUrl: string | null = null
  let authorHint: string | undefined

  const entries = await readJarMcmodInfo(jarPath)
  if (entries.length > 0) {
    const entry = entries[0]
    for (const candidate of [entry.url, entry.updateUrl]) {
      if (!githubUrl && candidate?.includes('github.com')) {
        githubUrl = stripUrl(candidate)
        ctx.log(chalk.green(`Found GitHub URL in mcmod.info: ${githubUrl}`))
      }
    }
    authorHint = entry.authorList?.[0]
  }

  if (!githubUrl) {
    const manifest = await readJarManifest(jarPath)
    if (manifest) {
      const gh = manifest.match(/^GitHub-URL:(.+)$/m)?.[1]?.trim()
      const imp = manifest.match(/^Implementation-URL:(.+)$/m)?.[1]?.trim()
      if (gh) githubUrl = gh
      else if (imp?.includes('github.com')) githubUrl = imp
      if (githubUrl) ctx.log(chalk.green(`Found GitHub URL in MANIFEST.MF: ${githubUrl}`))
      authorHint ??= manifest.match(/^Implementation-Vendor:(.+)$/m)?.[1]?.trim()
    }
  }

  if (githubUrl) {
    const cloned = await cloneAndVerify(githubUrl, displayName, ctx)
    if (cloned) return cloned
  }

  const searchName = query.replace(/-\d+(?:\.\d+)*(?:-.*)?$/g, '')
  if (authorHint) {
    ctx.log(chalk.cyan(`Searching GitHub with author '${authorHint}'...`))
    const cloned = await searchGhAndClone(searchName, authorHint, displayName, ctx)
    if (cloned) return cloned
  }
  ctx.log(chalk.cyan(`Searching GitHub for '${searchName}'...`))
  return searchGhAndClone(searchName, undefined, displayName, ctx)
}

/** Owners of sibling addons (same author) gathered from instance `issuesURL`s. */
function siblingOwnersFromInstance(addon: InstanceAddon, instance: MinecraftInstance): string[] {
  const author = addonAuthor(addon)
  if (!author) return []
  const owners: string[] = []
  for (const other of instance.installedAddons) {
    if (other.addonID === addon.addonID) continue
    if (addonAuthor(other)?.toLowerCase() !== author.toLowerCase()) continue
    const owner = other.issuesURL?.match(/github\.com\/([^/]+)/)?.[1]
    if (owner) owners.push(owner)
  }
  return owners
}

/** Find source via other repos by the same author (instance metadata). */
export async function findRepoFromSameAuthor(addon: InstanceAddon, instance: MinecraftInstance, query: string, ctx: Ctx): Promise<string | null> {
  const owners = siblingOwnersFromInstance(addon, instance)
  if (owners.length === 0) return null
  ctx.log(chalk.cyan(`Searching repos of same-author owners: ${[...new Set(owners)].join(', ')}`))
  return searchOwnersForRepo(owners, query, ctx)
}

/** Find source via same-author repos discovered through the CurseForge API. */
export async function findRepoFromSameAuthorCF(addon: InstanceAddon, instance: MinecraftInstance, query: string, ctx: Ctx): Promise<string | null> {
  const author = addonAuthor(addon)
  if (!author || !ctx.cfApiKey) return null

  const siblingIDs = instance.installedAddons
    .filter(a => a.addonID !== addon.addonID && addonAuthor(a)?.toLowerCase() === author.toLowerCase())
    .map(a => a.addonID)
  if (siblingIDs.length === 0) return null

  ctx.log(chalk.cyan(`Fetching CF data for ${siblingIDs.length} mods by '${author}'...`))
  try {
    const cfMods = await fetchMods(siblingIDs, ctx.cfApiKey)
    const owners = cfMods
      .map(m => (m?.links?.sourceUrl || m?.links?.issuesUrl)?.match(/github\.com\/([^/]+)/)?.[1])
      .filter((o): o is string => Boolean(o))
    if (owners.length === 0) return null
    return await searchOwnersForRepo(owners, query, ctx)
  }
  catch (e) {
    ctx.log(chalk.red(`CF batch fetch failed: ${e instanceof Error ? e.message : String(e)}`))
    return null
  }
}

/** Last-resort: ask the `gemini` CLI for a clone URL. */
export async function findRepoViaGemini(addon: InstanceAddon, ctx: Ctx): Promise<string | null> {
  const prompt = `find mod "${addon.name}" (CurseForge ID: ${addon.addonID}) for MC 1.12.2 source code repository link. Output only "git clone ..." command in answer. Output one word "unknown" if you cant find the source or only source for other versions available.`
  ctx.log(chalk.cyan('Querying Gemini AI for source repository...'))
  try {
    const { stdout } = await execAsync(`gemini -m gemini-2.5-flash -p "${prompt.replace(/"/g, '\\"')}"`, { timeout: 30000 })
    const repoUrl = stdout.trim().match(/git clone\s+(https?:\/\/\S+)/)?.[1]?.replace(/\/$/, '')
    if (!repoUrl) {
      ctx.log(chalk.yellow('Gemini could not find a source repository.'))
      return null
    }
    ctx.log(chalk.green(`Gemini found URL: ${repoUrl}`))
    return await cloneAndVerify(repoUrl, addon.name, ctx)
  }
  catch (e) {
    ctx.log(chalk.red(`Gemini search failed: ${e instanceof Error ? e.message : String(e)}`))
    return null
  }
}

/** Resolve and clone a repo for `query` using instance + CF metadata. */
export async function findRepoAndClone(query: string, instance: MinecraftInstance, ctx: Ctx): Promise<string | null> {
  const addon = findAddon(instance, query)
  if (!addon) {
    ctx.log(chalk.yellow(`Mod matching '${query}' not found in minecraftinstance.json.`))
    return null
  }
  ctx.log(chalk.green(`Found mod: ${addon.name} (AddonID: ${addon.addonID})`))

  const repoUrl = await getRepoUrl(addon, ctx)
  if (!repoUrl) {
    ctx.log(chalk.yellow('No direct repo URL. Trying other mods by same author...'))
    return findRepoFromSameAuthor(addon, instance, query, ctx)
  }
  return cloneAndVerify(repoUrl, addon.name, ctx)
}
