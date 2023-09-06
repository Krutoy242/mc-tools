<h1 align="center">@mctools/curseforge</h1>

Lib for working with CurseForge using minecraftinstance.json

<!-- extended_desc --><!-- /extended_desc -->

## Usage



## API
1. Install package
  > ```shell
  > npm i @mctools/curseforge
  > ```

2. Import functions from package.
  > ```ts
  > import fnc from "@mctools/curseforge"
  > ```


### Functions

#### fetchMods

▸ **fetchMods**(`modIds`, `cfApiKey`, `timeout?`, `doLogging?`): `Promise`<`CFV2.CF2Addon`[]\>

Get mod information from CurseForge, such as name, summary, download count, etc.

##### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `modIds` | `number`[] | `undefined` | IDs of mods you want to fetch. `[32274, 59751, 59816]` |
| `cfApiKey` | `string` | `undefined` | CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys |
| `timeout` | `number` | `96` | If file was already fetched last `timeout` hours, it would be loaded from cache file |
| `doLogging` | `boolean` | `false` | Log into stdout |

##### Returns

`Promise`<`CFV2.CF2Addon`[]\>

Object with information about mods

**`Example`**

```ts
const cfMods = await fetchMods([32274, 59751, 59816], key)
console.log(cfMods.map(m => m.name)) // ["JourneyMap", "Forestry", "Random Things"]
```

___

#### loadMCInstanceFiltered

▸ **loadMCInstanceFiltered**(`mci`, `ignore?`): `Minecraftinstance`

Load minecraftinstance.json file from disk, filtering unavailable or ignored mods

##### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `mci` | `Minecraftinstance` | Json object of `minecraftinstance.json` |
| `ignore?` | `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[] | .gitignore-like file content with mods to ignore. For example, `ignore` contains 3 lines: ```ts const mci = loadMCInstanceFiltered(mciPath, ` scripts/debug config/FBP/* mods/tellme-* `) ``` Since it have line `mods/tellme-*` in it, mod `tellme-1.12.2-0.7.0.jar` would be removed from result. |

##### Returns

`Minecraftinstance`

Same `minecraftinstance` object but without unavailable on CF mods like Optifine or Nutrition.

___

#### modList

▸ **modList**(`fresh`, `old?`, `ignore?`): `ModsUnion`

Compare two minecraftinstance.json files and output differences between them

##### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `fresh` | `Minecraftinstance` | Json object from `minecraftinstance.json` of current version |
| `old?` | `undefined` | Json object from `minecraftinstance.json` of previous version. |
| `ignore?` | `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[] | .gitignore-like file content with mods to ignore. Useful for dev-only mods that should not be included in result. |

##### Returns

`ModsUnion`

Result of comparsion.
if `old` is omited, returns only `union` field.

▸ **modList**(`fresh`, `old?`, `ignore?`): `ModsComparsion`

##### Parameters

| Name | Type |
| :------ | :------ |
| `fresh` | `Minecraftinstance` |
| `old?` | `Minecraftinstance` |
| `ignore?` | `string` \| `Ignore` \| readonly (`string` \| `Ignore`)[] |

##### Returns

`ModsComparsion`

## Author

* https://github.com/Krutoy242

## Other tools


* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
