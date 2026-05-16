export interface ModLoader {
  id     : string
  primary: boolean
}

export interface Minecraft {
  modLoaders?: ModLoader[]
  version    : string
}

export interface ExternalDependency {
  name: string
  sha : string
  url : string
}

export interface ModpackManifestFile {
  fileID      : number
  projectID   : number
  sides?      : ('client' | 'server')[]
  ___name?    : string
  downloadUrl?: string
  required    : boolean
}

export interface ModpackManifest {
  author               : string
  externalDependencies?: ExternalDependency[]
  files                : ModpackManifestFile[]
  manifestType         : string
  manifestVersion      : number
  minecraft            : Minecraft
  name                 : string
  overrides            : string
  projectID            : number
  version              : string
}
