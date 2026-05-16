import process from 'node:process'
import * as vscode from 'vscode'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface McToolsConfig {
  debugLog: {
    path               : string
    maxInitialReadBytes: number
    overlapBytes       : number
    configPath         : string
    defaultMatchRegex  : string
  }
  crafttweakerLog: {
    path          : string
    fileExtensions: string[]
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
      path               : get('debugLog.path', 'logs/debug.log'),
      maxInitialReadBytes: get('debugLog.maxInitialReadBytes', 10_485_760),
      overlapBytes       : get('debugLog.overlapBytes', 4096),
      configPath         : get('debugLog.configPath', 'dev/tools/mct-errors-config.yml'),
      defaultMatchRegex  : get('debugLog.defaultMatchRegex', '.*(?:WARN|ERROR|FATAL).*'),
    },
    crafttweakerLog: {
      path          : get('crafttweakerLog.path', 'crafttweaker.log'),
      fileExtensions: get('crafttweakerLog.fileExtensions', ['.zs']),
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

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('mc-tools')) callback()
  })
}
