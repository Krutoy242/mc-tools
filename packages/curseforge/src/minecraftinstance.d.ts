export interface RootObject {
  baseModLoader: BaseModLoader;
  isUnlocked: boolean;
  javaArgsOverride?: any;
  lastPlayed: string;
  playedCount: number;
  manifest?: any;
  fileDate: string;
  installedModpack?: any;
  projectID: number;
  fileID: number;
  customAuthor: string;
  modpackOverrides: any[];
  isMemoryOverride: boolean;
  allocatedMemory: number;
  profileImagePath: string;
  isVanilla: boolean;
  guid: string;
  gameTypeID: number;
  installPath: string;
  name: string;
  cachedScans: any[];
  isValid: boolean;
  lastPreviousMatchUpdate: string;
  lastRefreshAttempt: string;
  isEnabled: boolean;
  gameVersion: string;
  gameVersionFlavor?: any;
  gameVersionTypeId?: any;
  preferenceAlternateFile: boolean;
  preferenceAutoInstallUpdates: boolean;
  preferenceQuickDeleteLibraries: boolean;
  preferenceDeleteSavedVariables: boolean;
  preferenceProcessFileCommands: boolean;
  preferenceReleaseType: number;
  preferenceModdingFolderPath?: any;
  syncProfile: SyncProfile;
  installDate: string;
  installedAddons: InstalledAddon[];
  wasNameManuallyChanged: boolean;
}

export interface InstalledAddon {
  instanceID: string;
  modSource: number;
  addonID: number;
  gameID: number;
  gameInstanceID: string;
  name: string;
  modFolderPath?: any;
  fileNameOnDisk: string;
  authors: Author[];
  primaryAuthor: string;
  primaryCategoryId: number;
  packageType: number;
  webSiteURL: string;
  thumbnailUrl: string;
  tags: any[];
  installedFile: InstalledFile;
  dateInstalled: string;
  dateUpdated: string;
  dateLastUpdateAttempted: string;
  status: number;
  installSource: number;
  preferenceReleaseType?: any;
  preferenceAutoInstallUpdates?: any;
  preferenceAlternateFile: boolean;
  preferenceIsIgnored: boolean;
  isModified: boolean;
  isWorkingCopy: boolean;
  isFuzzyMatch: boolean;
  manifestName?: any;
  installedTargets: any[];
  latestFile: LatestFile;
}

export interface LatestFile {
  id: number;
  fileName: string;
  fileDate: string;
  fileLength: number;
  releaseType: number;
  fileStatus: number;
  downloadUrl: string;
  isAlternate: boolean;
  alternateFileId: number;
  dependencies: Dependency[];
  isAvailable: boolean;
  modules: Module[];
  packageFingerprint: number;
  gameVersion: string[];
  sortableGameVersion: SortableGameVersion[];
  hasInstallScript: boolean;
  isCompatibleWithClient: boolean;
  isEarlyAccessContent: boolean;
  restrictProjectFileAccess: number;
  projectStatus: number;
  projectId: number;
  fileNameOnDisk: string;
  Hashes: Hash[];
}

export interface InstalledFile {
  id: number;
  fileName: string;
  fileDate: string;
  fileLength: number;
  releaseType: number;
  fileStatus: number;
  downloadUrl: string;
  isAlternate: boolean;
  alternateFileId: number;
  dependencies: Dependency[];
  isAvailable: boolean;
  modules: Module[];
  packageFingerprint: number;
  gameVersion: string[];
  sortableGameVersion: SortableGameVersion[];
  hasInstallScript: boolean;
  isCompatibleWithClient: boolean;
  isEarlyAccessContent: boolean;
  restrictProjectFileAccess: number;
  projectStatus: number;
  projectId: number;
  fileNameOnDisk: string;
  Hashes: Hash[];
}

export interface Hash {
  Value: string;
}

export interface SortableGameVersion {
  gameVersion: string;
  gameVersionName: string;
  gameVersionTypeId: number;
}

export interface Module {
  foldername: string;
  fingerprint: number;
  invalidFingerprint: boolean;
}

export interface Dependency {
  addonId: number;
  type: number;
}

export interface Author {
  Name: string;
}

export interface SyncProfile {
  PreferenceEnabled: boolean;
  PreferenceAutoSync: boolean;
  PreferenceAutoDelete: boolean;
  PreferenceBackupSavedVariables: boolean;
  GameInstanceGuid: string;
  SyncProfileID: number;
  SavedVariablesProfile?: any;
  LastSyncDate: string;
}

export interface BaseModLoader {
  forgeVersion: string;
  name: string;
  type: number;
  downloadUrl: string;
  filename: string;
  installMethod: number;
  latest: boolean;
  recommended: boolean;
  versionJson: string;
  librariesInstallLocation: string;
  minecraftVersion: string;
  installProfileJson: string;
}
