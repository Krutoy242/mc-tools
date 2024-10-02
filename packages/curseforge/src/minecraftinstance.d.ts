export interface Minecraftinstance {
  allocatedMemory               : number
  baseModLoader                 : BaseModLoader
  cachedScans                   : any[]
  customAuthor                  : string
  fileDate                      : string
  fileID                        : number
  gameTypeID                    : number
  gameVersion                   : string
  gameVersionFlavor?            : any
  gameVersionTypeId?            : any
  guid                          : string
  installDate                   : string
  installedAddons               : InstalledAddon[]
  installedModpack?             : any
  installPath                   : string
  isEnabled                     : boolean
  isMemoryOverride              : boolean
  isUnlocked                    : boolean
  isValid                       : boolean
  isVanilla                     : boolean
  javaArgsOverride?             : any
  lastPlayed                    : string
  lastPreviousMatchUpdate       : string
  lastRefreshAttempt            : string
  manifest?                     : any
  modpackOverrides              : any[]
  name                          : string
  playedCount                   : number
  preferenceAlternateFile       : boolean
  preferenceAutoInstallUpdates  : boolean
  preferenceDeleteSavedVariables: boolean
  preferenceModdingFolderPath?  : any
  preferenceProcessFileCommands : boolean
  preferenceQuickDeleteLibraries: boolean
  preferenceReleaseType         : number
  profileImagePath              : string
  projectID                     : number
  syncProfile                   : SyncProfile
  wasNameManuallyChanged        : boolean
}

export interface InstalledAddon {
  addonID                      : number
  authors                      : Author[]
  dateInstalled                : string
  dateLastUpdateAttempted      : string
  dateUpdated                  : string
  fileNameOnDisk               : string
  gameID                       : number
  gameInstanceID               : string
  installedFile                : InstalledFile
  installedTargets             : any[]
  installSource                : number
  instanceID                   : string
  isFuzzyMatch                 : boolean
  isModified                   : boolean
  isWorkingCopy                : boolean
  latestFile                   : LatestFile
  manifestName?                : any
  modFolderPath?               : any
  modSource                    : number
  name                         : string
  packageType                  : number
  preferenceAlternateFile      : boolean
  preferenceAutoInstallUpdates?: any
  preferenceIsIgnored          : boolean
  preferenceReleaseType?       : any
  primaryAuthor                : string
  primaryCategoryId            : number
  status                       : number
  tags                         : any[]
  thumbnailUrl                 : string
  webSiteURL                   : string
}

export interface LatestFile {
  alternateFileId          : number
  dependencies             : Dependency[]
  downloadUrl              : string
  fileDate                 : string
  fileLength               : number
  fileName                 : string
  fileNameOnDisk           : string
  fileStatus               : number
  gameVersion              : string[]
  Hashes                   : Hash[]
  hasInstallScript         : boolean
  id                       : number
  isAlternate              : boolean
  isAvailable              : boolean
  isCompatibleWithClient   : boolean
  isEarlyAccessContent     : boolean
  modules                  : Module[]
  packageFingerprint       : number
  projectId                : number
  projectStatus            : number
  releaseType              : number
  restrictProjectFileAccess: number
  sortableGameVersion      : SortableGameVersion[]
}

export interface InstalledFile {
  alternateFileId          : number
  dependencies             : Dependency[]
  downloadUrl              : string
  fileDate                 : string
  fileLength               : number
  fileName                 : string
  fileNameOnDisk           : string
  fileStatus               : number
  gameVersion              : string[]
  Hashes                   : Hash[]
  hasInstallScript         : boolean
  id                       : number
  isAlternate              : boolean
  isAvailable              : boolean
  isCompatibleWithClient   : boolean
  isEarlyAccessContent     : boolean
  modules                  : Module[]
  packageFingerprint       : number
  projectId                : number
  projectStatus            : number
  releaseType              : number
  restrictProjectFileAccess: number
  sortableGameVersion      : SortableGameVersion[]
}

export interface Hash {
  Value: string
}

export interface SortableGameVersion {
  gameVersion      : string
  gameVersionName  : string
  gameVersionTypeId: number
}

export interface Module {
  fingerprint       : number
  foldername        : string
  invalidFingerprint: boolean
}

export interface Dependency {
  addonId: number
  type   : number
}

export interface Author {
  Name: string
}

export interface SyncProfile {
  GameInstanceGuid              : string
  LastSyncDate                  : string
  PreferenceAutoDelete          : boolean
  PreferenceAutoSync            : boolean
  PreferenceBackupSavedVariables: boolean
  PreferenceEnabled             : boolean
  SavedVariablesProfile?        : any
  SyncProfileID                 : number
}

export interface BaseModLoader {
  downloadUrl             : string
  filename                : string
  forgeVersion            : string
  installMethod           : number
  installProfileJson      : string
  latest                  : boolean
  librariesInstallLocation: string
  minecraftVersion        : string
  name                    : string
  recommended             : boolean
  type                    : number
  versionJson             : string
}
