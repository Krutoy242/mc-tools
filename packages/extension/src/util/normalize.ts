import * as fs from 'node:fs/promises'
import * as path from 'pathe'

export function normalizeJarName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/^[!+`]+/, '')
    .replace(/-?mc?1\.\d+(?:\.\d+)?/, '')
    .replace(/-[\d.].*$/, '')
    .replace(/\.jar(?:\.disabled)?$/, '')
    .replace(/[^a-z0-9]/g, '')
}

export function normalizeConfigName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.cfg$/, '')
    .replace(/\.json$/, '')
    .replace(/[^a-z0-9]/g, '')
}

export async function isMinecraftModpack(root: string): Promise<boolean> {
  const markers = ['mods', 'minecraftinstance.json', 'manifest.json']
  const checks = await Promise.all(
    markers.map(async (m) => {
      try {
        await fs.access(path.join(root, m))
        return true
      }
      catch {
        return false
      }
    })
  )
  return checks.some(Boolean)
}
