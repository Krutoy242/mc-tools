<h1 align="center">@mctools/curseforge</h1>

Lib for working with CurseForge using minecraftinstance.json

<!-- extended_desc -->
Bunch of functions, used for other `@mctools/` packages, such as fetching info for several mods at once.
<!-- /extended_desc -->

## Usage

## API

1. Install package
  > ```shell
  > npm i @mctools/curseforge
  > ```

2. Import functions from package.
  > ```ts
  > import fnc from '@mctools/curseforge'
  > ```

## functions

### `asAddonID`

> **asAddonID**(`n`): [`AddonID`](../type-aliases/AddonID.md)

Assert-cast a plain number into a branded AddonID.

- `n` `number`

**Returns:** [`AddonID`](../type-aliases/AddonID.md)

### `asFileID`

> **asFileID**(`n`): [`FileID`](../type-aliases/FileID.md)

Assert-cast a plain number into a branded FileID.

- `n` `number`

**Returns:** [`FileID`](../type-aliases/FileID.md)

### `fetchChangelog`

> **fetchChangelog**(`entry`, `cfApiKey`): `Promise`\<`string`\>

Fetch a single file changelog from CurseForge.

- `entry` [`ChangelogEntry`](../interfaces/ChangelogEntry.md) — Object with modId and fileId
- `cfApiKey` `string` — CurseForge API key

**Returns:** `Promise`\<`string`\> — Changelog HTML string, or empty string if not found

### `fetchChangelogs`

> **fetchChangelogs**(`entries`, `cfApiKey`, `doLogging?`, `concurrency?`): `Promise`\<`Map`\<`number`, `string`\>\>

Fetch changelogs for specific mod files from CurseForge.
Requests are executed in parallel with a concurrency limit.

- `entries` [`ChangelogEntry`](../interfaces/ChangelogEntry.md)[] — Array of { modId, fileId } objects
- `cfApiKey` `string` — CurseForge API key
- `doLogging?` `boolean` = `false` — Log progress into stdout
- `concurrency?` `number` = `15` — Maximum number of concurrent requests (default: 10)

**Returns:** `Promise`\<`Map`\<`number`, `string`\>\> — Map of fileId → changelog HTML string

### `fetchFile`

> **fetchFile**(`modId`, `fileId`, `cfApiKey`): `Promise`\<`CF2File` \| `undefined`\>

Fetch metadata for a single file.

- `modId` `number` — Mod ID the file belongs to
- `fileId` `number` — File ID
- `cfApiKey` `string` — CurseForge API key

**Returns:** `Promise`\<`CF2File` \| `undefined`\> — File metadata

### `fetchFiles`

> **fetchFiles**(`fileIds`, `cfApiKey`): `Promise`\<`CF2File`[]\>

Fetch metadata for multiple files at once using the batch endpoint.

- `fileIds` `number`[] — Array of file IDs
- `cfApiKey` `string` — CurseForge API key

**Returns:** `Promise`\<`CF2File`[]\> — Array of file metadata

### `fetchIntermediateFileChangelogs`

> **fetchIntermediateFileChangelogs**(`modId`, `oldFileId`, `newFileId`, `cfApiKey`, `doLogging?`, `gameVersion?`, `maxFiles?`, `concurrency?`): `Promise`\<[`FileChangelog`](../interfaces/FileChangelog.md)[]\>

Fetch all file changelogs between two file versions of a mod.
Files are ordered by upload date and filtered to include only those
strictly after oldFileId and up to newFileId.
Changelog requests are executed in parallel with a concurrency limit.

- `modId` `number`
- `oldFileId` `number`
- `newFileId` `number`
- `cfApiKey` `string`
- `doLogging?` `boolean` = `false`
- `gameVersion?` `string`
- `maxFiles?` `number` = `15`
- `concurrency?` `number` = `15`

**Returns:** `Promise`\<[`FileChangelog`](../interfaces/FileChangelog.md)[]\>

### `fetchMod`

> **fetchMod**(`modId`, `cfApiKey`, `timeout?`, `doLogging?`): `Promise`\<`CF2Addon`\>

Fetch a single mod from CurseForge.

- `modId` `number` — ID of the mod to fetch
- `cfApiKey` `string` — CurseForge API key
- `timeout?` `number` = `96` — Cache timeout in hours
- `doLogging?` `boolean` = `false` — Log into stdout

**Returns:** `Promise`\<`CF2Addon`\>

### `fetchMods`

> **fetchMods**(`modIds`, `cfApiKey`, `timeout?`, `doLogging?`): `Promise`\<`CF2Addon`[]\>

Get mod information from CurseForge, such as name, summary, download count, etc.

- `modIds` `number`[] — IDs of mods you want to fetch. `[32274, 59751, 59816]`
- `cfApiKey` `string` — CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys
- `timeout?` `number` = `96` — If file was already fetched last `timeout` hours, it would be loaded from cache file
- `doLogging?` `boolean` = `false` — Log into stdout

**Returns:** `Promise`\<`CF2Addon`[]\> — Object with information about mods

### `loadFromCF`

> **loadFromCF**(`modIds`, `cfApiKey`): `Promise`\<`CF2Addon`[]\>

- `modIds` `number`[]
- `cfApiKey` `string`

**Returns:** `Promise`\<`CF2Addon`[]\>

### `loadMCInstanceFiltered`

> **loadMCInstanceFiltered**(`mci`, `ignore?`): `Minecraftinstance`

Load a filtered view of a minecraftinstance.json object.

Returns a shallow-cloned instance with `installedAddons` narrowed to
on-CF, non-ignored mods. The original `mci` is not mutated.

- `mci` `Minecraftinstance` — Parsed `minecraftinstance.json`.
- `ignore?` `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[] — .gitignore-like content — mods matching these patterns (by `mods/<file>`) are excluded.

**Returns:** `Minecraftinstance`

### `modListDiff`

> **modListDiff**(`fresh`, `old`, `ignore?`): [`ModsComparison`](../interfaces/ModsComparison.md)

Compare two minecraftinstance.json snapshots and return a full breakdown
(`added`, `removed`, `both`, `updated`, plus the total `union`).

Use this when you have the previous version to diff against, typically for
generating a changelog.

- `fresh` `Minecraftinstance`
- `old` `Minecraftinstance`
- `ignore?` `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[]

**Returns:** [`ModsComparison`](../interfaces/ModsComparison.md)

### `modListUnion`

> **modListUnion**(`fresh`, `ignore?`): [`ModsUnion`](../interfaces/ModsUnion.md)

Collect the full set of addons from a single minecraftinstance, after
applying the same `.gitignore`-style filter as [modListDiff](modListDiff.md).

Use this when you don't have a previous instance to compare against.

- `fresh` `Minecraftinstance`
- `ignore?` `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[]

**Returns:** [`ModsUnion`](../interfaces/ModsUnion.md)

### `setCachePath`

> **setCachePath**(`path`): `void`

Override the file the CF mod cache reads/writes. Defaults to `~/.cache/mctools/curseforge-mods.json`.

- `path` `string`

**Returns:** `void`
## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [@mctools/tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
