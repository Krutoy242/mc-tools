import { loadConfig } from 'c12'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Branch {
  [mod: string]: string | Branch | (string | Branch)[]
}

export interface ReducerConfig {
  dependencies: Branch
  dependents: Branch
  forks: { [id: number]: number[] }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export async function getConfig(cwd: string) {
  const defaultConfig = (await loadConfig<ReducerConfig>({
    cwd: __dirname,
    name: 'reducer'
  })).config

  const { config } = await loadConfig<ReducerConfig>({
    cwd,
    name: 'reducer',
    defaultConfig,
  })

  return config
}
