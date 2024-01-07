import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Config { [name: string]: string }

export function loadConfig(configParam: string) {
  let config: Config
  if (existsSync(configParam)) {
    config = JSON.parse(readFileSync(configParam, 'utf8')) as Config
  }
  else if (existsSync('package.json')) {
    const pkgJson = JSON.parse(readFileSync('package.json', 'utf8'))
    const rgx = new RegExp(configParam)
    config = Object.fromEntries(
      Object.entries(pkgJson.scripts)
        .map(([k, v]) => rgx.test(k) ? [k.match(rgx)?.[1] ?? k, v] : undefined)
        .filter(Boolean) as [string, string][]
    ) as Config
  }
  else {
    throw new Error(`${resolve(configParam)} doesnt exist and package.json can't be loaded. Provide correct path.`)
  }
  if (!Object.keys(config).length) throw new Error('Config should have at least 1 entry')
  return config
}
