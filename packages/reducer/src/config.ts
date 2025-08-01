import { loadConfig } from 'c12'

export interface ModRgxMap {
  [mod: string]: string | string[]
}

export interface ReducerConfig {
  dependencies: ModRgxMap
  dependents  : ModRgxMap
}

export async function getConfig(cwd: string) {
  const { config } = await loadConfig<ReducerConfig>({
    cwd,
    name    : 'reducer',
    defaults: {
      dependencies: {},
      dependents  : {},
    },
  })
  return config
}
