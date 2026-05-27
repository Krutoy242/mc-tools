import { markdownToHtml } from '../utils/markdown.js'

const modrinthCache = new Map<string, string[]>()

export function extractModrinthSlug(text: string): string | undefined {
  const match = text.match(/modrinth\.com\/mod\/([^/"'\s)>]+)/i)
  return match?.[1]
}

export async function fetchModrinthChangelogs(slug: string, oldDate: string, newDate: string): Promise<string[]> {
  const cacheKey = `${slug}|${oldDate}|${newDate}`
  if (modrinthCache.has(cacheKey)) return modrinthCache.get(cacheKey)!

  try {
    const response = await fetch(`https://api.modrinth.com/v2/project/${slug}/version`, {
      headers: { 'User-Agent': 'mctools-modlist/0.1.2' },
    })
    if (!response.ok) {
      modrinthCache.set(cacheKey, [])
      return []
    }
    const versions = await response.json() as Array<{
      date_published: string
      changelog     : string
      version_number: string
    }>
    const oldTime = new Date(oldDate).getTime()
    const newTime = new Date(newDate).getTime()
    const result = versions
      .filter((v) => {
        const t = new Date(v.date_published).getTime()
        return t > oldTime && t <= newTime
      })
      .sort((a, b) => new Date(a.date_published).getTime() - new Date(b.date_published).getTime())
      .map((v) => {
        const changelog = v.changelog?.trim()
        return changelog ? markdownToHtml(changelog) : undefined
      })
      .filter((c): c is string => Boolean(c))
    modrinthCache.set(cacheKey, result)
    return result
  }
  catch {
    modrinthCache.set(cacheKey, [])
    return []
  }
}
