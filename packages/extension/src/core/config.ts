import process from 'node:process'
import * as vscode from 'vscode'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface McToolsConfig {
  debugLog: {
    enabled            : boolean
    path               : string
    maxInitialReadBytes: number
    configPath         : string
    defaultMatchRegex  : string
    maxDiagnostics     : number
  }
  crafttweakerLog: {
    enabled       : boolean
    path          : string
    fileExtensions: string[]
    maxDiagnostics: number
  }
  manifest: {
    autoUpdate: boolean
    postfix   : string
    ignorePath: string
    inputPath : string
  }
  modlist: {
    baselinePath: string
    ignorePath  : string
    templatePath: string
    outputPath  : string
    sortBy      : 'addonID' | 'name'
  }
  modTracker: {
    enabled               : boolean
    inputPath             : string
    configWatchPattern    : string
    globalFiles           : string[]
    ignoredMappingPatterns: string[]
  }
  curseforge: {
    apiKey: string
  }
  logging: {
    level: LogLevel
  }
}

function get<T>(key: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration('mc-tools').get<T>(key) ?? defaultValue
}

function getSection(): McToolsConfig {
  return {
    debugLog: {
      enabled            : get('debugLog.enabled', true),
      path               : get('debugLog.path', 'logs/debug.log'),
      maxInitialReadBytes: get('debugLog.maxInitialReadBytes', 67_108_864),
      configPath         : get('debugLog.configPath', 'dev/tools/mct-errors-config.yml'),
      defaultMatchRegex  : get('debugLog.defaultMatchRegex', '.*(?:WARN|ERROR|FATAL).*'),
      maxDiagnostics     : get('debugLog.maxDiagnostics', 500),
    },
    crafttweakerLog: {
      enabled       : get('crafttweakerLog.enabled', true),
      path          : get('crafttweakerLog.path', 'crafttweaker.log'),
      fileExtensions: get('crafttweakerLog.fileExtensions', ['.zs']),
      maxDiagnostics: get('crafttweakerLog.maxDiagnostics', 500),
    },
    manifest: {
      autoUpdate: get('manifest.autoUpdate', true),
      postfix   : get('manifest.postfix', ''),
      ignorePath: get('manifest.ignorePath', ''),
      inputPath : get('manifest.inputPath', 'minecraftinstance.json'),
    },
    modlist: {
      baselinePath: get('modlist.baselinePath', ''),
      ignorePath  : get('modlist.ignorePath', ''),
      templatePath: get('modlist.templatePath', ''),
      outputPath  : get('modlist.outputPath', 'MODS.md'),
      sortBy      : get('modlist.sortBy', 'addonID'),
    },
    modTracker: {
      enabled               : get('modTracker.enabled', true),
      inputPath             : get('modTracker.inputPath', 'minecraftinstance.json'),
      configWatchPattern    : get('modTracker.configWatchPattern', 'config/**/*'),
      globalFiles           : get('modTracker.globalFiles', ['MODS.md', '.gitignore', '.gitattributes']),
      ignoredMappingPatterns: get('modTracker.ignoredMappingPatterns', ['mods/*', 'minecraftinstance.json', 'manifest*.json', 'MODS.md', '.gitignore', '.gitattributes']),
    },
    curseforge: {
      apiKey: get('curseforge.apiKey', '') || process.env.CF_API_KEY || '',
    },
    logging: {
      level: get('logging.level', 'info'),
    },
  }
}

export const readConfig = getSection

export function onConfigChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('mc-tools')) callback(e)
  })
}
