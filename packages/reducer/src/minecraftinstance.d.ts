export interface MCInstance {
  baseModLoader: BaseModLoader;
  isUnlocked: boolean;
  javaArgsOverride?: any;
  javaDirOverride?: any;
  lastPlayed: string;
  playedCount: number;
  manifest?: any;
  fileDate: string;
  installedModpack?: any;
  projectID: number;
  fileID: number;
  customAuthor: string;
  modpackOverrides?: any;
  isMemoryOverride: boolean;
  allocatedMemory: number;
  profileImagePath: string;
  guid: string;
  gameTypeID: number;
  installPath: string;
  cachedScans: any[];
  isValid: boolean;
  lastPreviousMatchUpdate: string;
  lastRefreshAttempt: string;
  isEnabled: boolean;
  isPinned: boolean;
  gameVersion: string;
  gameVersionFlavor?: any;
  preferenceAlternateFile: boolean;
  preferenceAutoInstallUpdates: boolean;
  preferenceQuickDeleteLibraries: boolean;
  preferenceDeleteSavedVariables: boolean;
  preferenceProcessFileCommands: boolean;
  preferenceReleaseType: number;
  preferenceModdingFolderPath?: any;
  syncProfile: SyncProfile;
  preferenceShowAddOnInfo: boolean;
  installDate: string;
  installedAddons: InstalledAddon[];
  isMigrated: boolean;
  preferenceUploadProfile: boolean;
  wasNameManuallyChanged: boolean;
}

export interface InstalledAddon {
  name: string;
  addonID: number;
  gameInstanceID: string;
  installedFile: InstalledFile;
  dateInstalled: string;
  dateUpdated: string;
  dateLastUpdateAttempted: string;
  status: number;
  installSource: number;
  preferenceAutoInstallUpdates?: boolean;
  preferenceAlternateFile: boolean;
  preferenceIsIgnored: boolean;
  isModified: boolean;
  isWorkingCopy: boolean;
  isFuzzyMatch: boolean;
  preferenceReleaseType?: any;
  manifestName?: any;
  installedTargets?: any[];
}

export interface InstalledFile {
  id: number;
  displayName: string;
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
  hasInstallScript: boolean;
  isCompatibleWithClient: boolean;
  categorySectionPackageType: number;
  restrictProjectFileAccess: number;
  projectStatus: number;
  projectId: number;
  gameVersionDateReleased: string;
  gameId: number;
  isServerPack: boolean;
  fileNameOnDisk?: string;
  sortableGameVersion?: SortableGameVersion[];
  renderCacheId?: number;
  packageFingerprintId?: number;
  gameVersionMappingId?: number;
  gameVersionId?: number;
}

export interface SortableGameVersion {
  gameVersionPadded: string;
  gameVersion: string;
  gameVersionReleaseDate: string;
  gameVersionName: string;
  gameVersionTypeId: number;
}

export interface Module {
  foldername: string;
  fingerprint: number;
  type: number;
  invalidFingerprint: boolean;
}

export interface Dependency {
  id?: number;
  addonId: number;
  type: 0 | 1 | 2 | 3 | 4;
  fileId?: number;
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
  id: number;
  gameVersionId: number;
  minecraftGameVersionId: number;
  forgeVersion: string;
  name: string;
  type: number;
  downloadUrl: string;
  filename: string;
  installMethod: number;
  latest: boolean;
  recommended: boolean;
  approved: boolean;
  dateModified: string;
  mavenVersionString: string;
  versionJson: string;
  librariesInstallLocation: string;
  minecraftVersion: string;
  modLoaderGameVersionId: number;
  modLoaderGameVersionTypeId: number;
  modLoaderGameVersionStatus: number;
  modLoaderGameVersionTypeStatus: number;
  mcGameVersionId: number;
  mcGameVersionTypeId: number;
  mcGameVersionStatus: number;
  mcGameVersionTypeStatus: number;
  installProfileJson: string;
}