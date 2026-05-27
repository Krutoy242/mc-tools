import type { AddonID, FileID } from './minecraftinstance.js'

export interface ChangelogEntry {
  modId : AddonID
  fileId: FileID
}

export interface FileChangelog {
  fileId   : FileID
  fileName : string
  fileDate : string
  changelog: string
}

/** Mods list that always present in mc instance */
export interface ModsUnion {
  /** Union of all mods in both instances */
  union: import('./minecraftinstance.js').InstalledAddon[]
}

/** Old and new addons */
export interface AddonDifference {
  now: import('./minecraftinstance.js').InstalledAddon
  was: import('./minecraftinstance.js').InstalledAddon
}

/** Result of comparison of two `minecraftinstance`s */
export interface ModsComparison extends ModsUnion {
  /** Mods that exist in new instance, but absent in old */
  added?: import('./minecraftinstance.js').InstalledAddon[]

  /** Intersection, mods that present in both instances */
  both?: import('./minecraftinstance.js').InstalledAddon[]

  /** Mods that exist in old, but absent in new */
  removed?: import('./minecraftinstance.js').InstalledAddon[]

  /** Array of mods with same ID but different versions */
  updated?: AddonDifference[]
}
