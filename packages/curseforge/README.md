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

### Parameters

#### n

`number`

### Returns

[`AddonID`](../type-aliases/AddonID.md)

### `asFileID`

> **asFileID**(`n`): [`FileID`](../type-aliases/FileID.md)

Assert-cast a plain number into a branded FileID.

### Parameters

#### n

`number`

### Returns

[`FileID`](../type-aliases/FileID.md)

### `fetchMods`

> **fetchMods**(`modIds`, `cfApiKey`, `timeout?`, `doLogging?`): `Promise`\<`CF2Addon`[]\>

Get mod information from CurseForge, such as name, summary, download count, etc.

### Parameters

#### modIds

`number`[]

IDs of mods you want to fetch. `[32274, 59751, 59816]`

#### cfApiKey

`string`

CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys

#### timeout?

`number` = `96`

If file was already fetched last `timeout` hours, it would be loaded from cache file

#### doLogging?

`boolean` = `false`

Log into stdout

### Returns

`Promise`\<`CF2Addon`[]\>

Object with information about mods

### Example

```ts
const cfMods = await fetchMods([32274, 59751, 59816], key)
console.log(cfMods.map(m => m.name)) // ["JourneyMap", "Forestry", "Random Things"]
```

### `loadMCInstanceFiltered`

> **loadMCInstanceFiltered**(`mci`, `ignore?`): `Minecraftinstance`

Load a filtered view of a minecraftinstance.json object.

Returns a shallow-cloned instance with `installedAddons` narrowed to
on-CF, non-ignored mods. The original `mci` is not mutated.

### Parameters

#### mci

`Minecraftinstance`

Parsed `minecraftinstance.json`.

#### ignore?

`string` \| `Ignore` \| readonly (`string` \| `Ignore`)[]

.gitignore-like content — mods matching these patterns (by `mods/<file>`) are excluded.

### Returns

`Minecraftinstance`

### `modListDiff`

> **modListDiff**(`fresh`, `old`, `ignore?`): `ModsComparsion`

Compare two minecraftinstance.json snapshots and return a full breakdown
(`added`, `removed`, `both`, `updated`, plus the total `union`).

Use this when you have the previous version to diff against, typically for
generating a changelog.

### Parameters

#### fresh

`Minecraftinstance`

#### old

`Minecraftinstance`

#### ignore?

`string` \| `Ignore` \| readonly (`string` \| `Ignore`)[]

### Returns

`ModsComparsion`

### `modListUnion`

> **modListUnion**(`fresh`, `ignore?`): `ModsUnion`

Collect the full set of addons from a single minecraftinstance, after
applying the same `.gitignore`-style filter as [modListDiff](modListDiff.md).

Use this when you don't have a previous instance to compare against.

### Parameters

#### fresh

`Minecraftinstance`

#### ignore?

`string` \| `Ignore` \| readonly (`string` \| `Ignore`)[]

### Returns

`ModsUnion`

### `setCachePath`

> **setCachePath**(`path`): `void`

Override the file the CF mod cache reads/writes. Defaults to `~/.cache/mctools/curseforge-mods.json`.

### Parameters

#### path

`string`

### Returns

`void`

## type-aliases

### `AddonID`

> **AddonID** = `number` & `object`

Branded numeric ID of a CurseForge addon (project).
Use `asAddonID(n)` to construct from a plain number when you own the value.

### Type Declaration

#### \_\_brand

> `readonly` **\_\_brand**: `"AddonID"`

### `FileID`

> **FileID** = `number` & `object`

Branded numeric ID of a specific file (release) of an addon.

### Type Declaration

#### \_\_brand

> `readonly` **\_\_brand**: `"FileID"`

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
