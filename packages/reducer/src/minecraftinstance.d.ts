export interface MCInstance {
  allocatedMemory               : number
  baseModLoader                 : BaseModLoader
  cachedScans                   : any[]
  customAuthor                  : string
  fileDate                      : string
  fileID                        : number
  gameTypeID                    : number
  gameVersion                   : string
  gameVersionFlavor?            : any
  guid                          : string
  installDate                   : string
  installedAddons               : InstalledAddon[]
  installedModpack?             : any
  installPath                   : string
  isEnabled                     : boolean
  isMemoryOverride              : boolean
  isMigrated                    : boolean
  isPinned                      : boolean
  isUnlocked                    : boolean
  isValid                       : boolean
  javaArgsOverride?             : any
  javaDirOverride?              : any
  lastPlayed                    : string
  lastPreviousMatchUpdate       : string
  lastRefreshAttempt            : string
  manifest?                     : any
  modpackOverrides?             : any
  playedCount                   : number
  preferenceAlternateFile       : boolean
  preferenceAutoInstallUpdates  : boolean
  preferenceDeleteSavedVariables: boolean
  preferenceModdingFolderPath?  : any
  preferenceProcessFileCommands : boolean
  preferenceQuickDeleteLibraries: boolean
  preferenceReleaseType         : number
  preferenceShowAddOnInfo       : boolean
  preferenceUploadProfile       : boolean
  profileImagePath              : string
  projectID                     : number
  syncProfile                   : SyncProfile
  wasNameManuallyChanged        : boolean
}

export interface InstalledAddon {
  addonID                      : number
  dateInstalled                : string
  dateLastUpdateAttempted      : string
  dateUpdated                  : string
  gameInstanceID               : string
  installedFile                : InstalledFile
  installedTargets?            : any[]
  installSource                : number
  isFuzzyMatch                 : boolean
  isModified                   : boolean
  isWorkingCopy                : boolean
  manifestName?                : any
  name                         : string
  preferenceAlternateFile      : boolean
  preferenceAutoInstallUpdates?: boolean
  preferenceIsIgnored          : boolean
  preferenceReleaseType?       : any
  status                       : number
}

export interface InstalledFile {
  alternateFileId           : number
  categorySectionPackageType: number
  dependencies              : Dependency[]
  displayName               : string
  downloadUrl               : string
  fileDate                  : string
  fileLength                : number
  fileName                  : string
  fileNameOnDisk?           : string
  fileStatus                : number
  gameId                    : number
  gameVersion               : string[]
  gameVersionDateReleased   : string
  gameVersionId?            : number
  gameVersionMappingId?     : number
  hasInstallScript          : boolean
  id                        : number
  isAlternate               : boolean
  isAvailable               : boolean
  isCompatibleWithClient    : boolean
  isServerPack              : boolean
  modules                   : Module[]
  packageFingerprint        : number
  packageFingerprintId?     : number
  projectId                 : number
  projectStatus             : number
  releaseType               : number
  renderCacheId?            : number
  restrictProjectFileAccess : number
  sortableGameVersion?      : SortableGameVersion[]
}

export interface SortableGameVersion {
  gameVersion           : string
  gameVersionName       : string
  gameVersionPadded     : string
  gameVersionReleaseDate: string
  gameVersionTypeId     : number
}

export interface Module {
  fingerprint       : number
  foldername        : string
  invalidFingerprint: boolean
  type              : number
}

export interface Dependency {
  addonId: number
  fileId?: number
  id?    : number
  type   : 0 | 1 | 2 | 3 | 4
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
  approved                      : boolean
  dateModified                  : string
  downloadUrl                   : string
  filename                      : string
  forgeVersion                  : string
  gameVersionId                 : number
  id                            : number
  installMethod                 : number
  installProfileJson            : string
  latest                        : boolean
  librariesInstallLocation      : string
  mavenVersionString            : string
  mcGameVersionId               : number
  mcGameVersionStatus           : number
  mcGameVersionTypeId           : number
  mcGameVersionTypeStatus       : number
  minecraftGameVersionId        : number
  minecraftVersion              : string
  modLoaderGameVersionId        : number
  modLoaderGameVersionStatus    : number
  modLoaderGameVersionTypeId    : number
  modLoaderGameVersionTypeStatus: number
  name                          : string
  recommended                   : boolean
  type                          : number
  versionJson                   : string
}
