import process from 'node:process'
import envPaths from 'env-paths'
import fg from 'fast-glob'
import fs from 'fs-extra'
import { join, resolve } from 'pathe'

export interface Source {
  id    : 'ct' | 'native'
  label : string
  root  : string
  files : string[]
  native: boolean
}

const DOCS_DIR = resolve(process.cwd(), '~docs')
const CACHE_DIR = envPaths('e2ee-zs-find', { suffix: '' }).cache

interface SourceSpec {
  id    : Source['id']
  label : string
  dir   : string
  native: boolean
  cache : boolean
}

const SPECS: SourceSpec[] = [
  { id: 'ct', label: 'ct-dump', dir: 'ct-dump', native: false, cache: true },
  { id: 'native', label: 'native', dir: 'ct-dump-native', native: true, cache: true },
]

interface CacheFile {
  root   : string
  mtimeMs: number
  files  : string[]
}

async function listFiles(root: string): Promise<string[]> {
  return fg('**/*.dzs', { cwd: root, onlyFiles: true })
}

async function loadCached(spec: SourceSpec, root: string, reindex: boolean): Promise<string[]> {
  const cachePath = join(CACHE_DIR, `${spec.id}-index.json`)
  const { mtimeMs } = await fs.stat(root)

  if (!reindex && await fs.pathExists(cachePath)) {
    try {
      const cached = await fs.readJson(cachePath) as CacheFile
      if (cached.root === root && cached.mtimeMs === mtimeMs && Array.isArray(cached.files))
        return cached.files
    }
    catch {
    }
  }

  const files = await listFiles(root)
  await fs.ensureDir(CACHE_DIR)
  await fs.writeJson(cachePath, { root, mtimeMs, files } satisfies CacheFile)
  return files
}

export async function loadSources(opts: { reindex?: boolean } = {}): Promise<{
  sources: Source[]
  skipped: { spec: SourceSpec, reason: string }[]
}> {
  const sources: Source[] = []
  const skipped: { spec: SourceSpec, reason: string }[] = []

  for (const spec of SPECS) {
    const link = join(DOCS_DIR, spec.dir)
    if (!await fs.pathExists(link)) {
      skipped.push({ spec, reason: `not found at ${link}` })
      continue
    }
    const root = await fs.realpath(link)
    const files = spec.cache
      ? await loadCached(spec, root, opts.reindex ?? false)
      : await listFiles(root)
    sources.push({ id: spec.id, label: spec.label, root, files, native: spec.native })
  }

  return { sources, skipped }
}
