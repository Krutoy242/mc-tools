import { Buffer } from 'node:buffer'
import yauzl from 'yauzl'

/**
 * Extract a single text entry from a JAR (zip) by exact path, or `null` if the
 * entry is missing / unreadable. A leading BOM is stripped. Reads lazily and
 * closes the archive as soon as the entry is found.
 */
export async function readJarEntry(jarPath: string, entryName: string): Promise<string | null> {
  return new Promise((resolve) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        resolve(null)
        return
      }

      let found = false
      zip.on('entry', (entry: { fileName: string }) => {
        if (entry.fileName !== entryName) {
          zip.readEntry()
          return
        }
        found = true
        zip.openReadStream(entry as never, (err2, stream) => {
          if (err2 || !stream) {
            resolve(null)
            zip.close()
            return
          }
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            let text = Buffer.concat(chunks).toString('utf8')
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
            resolve(text)
            zip.close()
          })
          stream.on('error', () => {
            resolve(null)
            zip.close()
          })
        })
      })
      zip.on('end', () => {
        if (!found) {
          resolve(null)
          zip.close()
        }
      })
      zip.on('error', () => {
        resolve(null)
        zip.close()
      })
      zip.readEntry()
    })
  })
}

export interface JarMcmodEntry {
  modid?     : string
  name?      : string
  url?       : string
  updateUrl? : string
  authorList?: string[]
}

/** Parse `mcmod.info` (array or `{ modList }`) from a jar. */
export async function readJarMcmodInfo(jarPath: string): Promise<JarMcmodEntry[]> {
  const content = await readJarEntry(jarPath, 'mcmod.info')
  if (!content) return []
  try {
    const json = JSON.parse(content) as JarMcmodEntry[] | { modList?: JarMcmodEntry[] }
    return Array.isArray(json) ? json : json.modList ?? []
  }
  catch {
    return []
  }
}

/** Read `META-INF/MANIFEST.MF` from a jar as raw text. */
export async function readJarManifest(jarPath: string): Promise<string | null> {
  return readJarEntry(jarPath, 'META-INF/MANIFEST.MF')
}
