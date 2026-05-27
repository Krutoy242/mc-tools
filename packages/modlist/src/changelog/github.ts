import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { markdownToHtml } from '../utils/markdown.js'

const execAsync = promisify(exec)

const ghCache = new Map<string, string | undefined>()

export function extractGitHubCompare(text: string): { owner: string, repo: string, base: string, head: string } | undefined {
  // eslint-disable-next-line regexp/no-misleading-capturing-group
  const match = text.match(/github\.com\/([^/]+)\/([^/]+)\/compare\/([^\s">]+)\.\.\.([^\s">]+)/i)
  if (!match) return undefined
  return { owner: match[1], repo: match[2], base: match[3], head: match[4] }
}

export async function fetchGitHubChangelog(owner: string, repo: string, base: string, head: string): Promise<string | undefined> {
  const cacheKey = `${owner}/${repo}/${base}...${head}`
  if (ghCache.has(cacheKey)) return ghCache.get(cacheKey)

  try {
    // Try release notes for head first
    const { stdout: releaseBody } = await execAsync(
      `gh api repos/${owner}/${repo}/releases/tags/${head} --jq ".body"`,
      { encoding: 'utf8', timeout: 10000 }
    )
    if (releaseBody?.trim() && !releaseBody.includes('Full Changelog')) {
      const result = markdownToHtml(releaseBody.trim())
      ghCache.set(cacheKey, result)
      return result
    }

    // Fallback to compare API
    const { stdout: compareJson } = await execAsync(
      `gh api repos/${owner}/${repo}/compare/${base}...${head}`,
      { encoding: 'utf8', timeout: 10000 }
    )
    const compare = JSON.parse(compareJson) as { commits?: Array<{ commit?: { message?: string } }> }
    const messages = compare.commits
      ?.map(c => c.commit?.message?.split('\n')[0])
      .filter((m): m is string => Boolean(m))
    const result = messages?.length ? `<ul>${messages.map(m => `<li>${m}</li>`).join('')}</ul>` : undefined
    ghCache.set(cacheKey, result)
    return result
  }
  catch {
    ghCache.set(cacheKey, undefined)
    return undefined
  }
}
