<h1 align="center">@mctools/modlist</h1>

Generate .md file with all mods listed

<!-- extended_desc -->
> This tool was created for the mod list of [E2E-E](https://github.com/Krutoy242/Enigmatica2Expert-Extended/blob/cd12cfc750393b2ac4f9fa6ef2a4d103c412cb1b/MODS.md) modpack as well as for its [changelogs](https://github.com/Krutoy242/Enigmatica2Expert-Extended/blob/489f7f9c2dc41efc8c8a7cf565e0de655f61ea20/changelogs/LATEST.md).

This tool can be used for two purposes:

1. Generate modlist with any additional information of mods, such as `mod name`, `description`, `link`, `image`, `download count` and many more.
2. Generate changes by comparing two `minecraftinstance.json` files. Useful for changelogs or forked modpacks.

Example of resulted file with icons and formatting:

![Example of output file](https://i.imgur.com/ZHMKUiU.png)

Result of comparsion two manifests:

![Example of comparsion](https://i.imgur.com/b7s0AfD.png)
<!-- /extended_desc -->

## Usage

You can use this package either as CLI tool or as library.

To use as CLI tool:

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/modlist --help
    ```

### Options

```shell
Options:
      --version     Show version number  [boolean]
  -k, --key         Path to file with CurseForge API key.
                    Get one at https://console.curseforge.com/?#/api-keys.
                    If omitted, environment variable `CURSE_FORGE_API_KEY` would be used instead.  [string]
  -i, --ignore      Path to ignore file similar to .gitignore.
                    Used to exclude mods that used only in dev environment and should not be included in mod list.
                    `ignore` file content example: "mods/tellme-*"  [string]
  -m, --mcinstance  Path to instance json.
                    This json file generates by CurseForge launcher.
                    It located at the root of Minecraft instance folder.  [default: "minecraftinstance.json"]
  -l, --old         Path to old instance json to compare with.
                    This option is useful when you want to make changelog and compare two modpack versions.  [string]
  -t, --template    Path to Handlebar template.
                    See `default.hbs` for more info.
  -s, --sort        Sort field of CurseForge addon.
                    Accept deep path like `cf2Addon.downloadCount`.
                    `/` symbol at start of value flip sort order.  [default: "addonID"]
  -o, --output      Path to output file.  [default: "MODS.md"]
  -v, --verbose     Log working process in stdout  [boolean]
  -h, --help        Show help  [boolean]

Examples:
  npx @mctools/modlist                                   If executed from minecraft folder, generate MODS.md file in same folder.
                                                         Environment must have variable CURSE_FORGE_API_KEY.
  npx @mctools/modlist --key=~secret_api_key.txt         Create mod list,
                                                         but take key from secret_api_key.txt file
  npx @mctools/modlist --ignore=devonly.ignore           Use .gitignore-like file to exclude mods,
                                                         that should not present in list.
  npx @mctools/modlist --mcinstance=mci.json             Generate mod list based non-default
                                                         named minecraftinstance.json file.
  npx @mctools/modlist --old=minecraftinstance_old.json  Generate comparsion of two modpacks / modpack versions.
                                                         Useful for generating modpack changelog.
  npx @mctools/modlist --template=fancy.hbs              Use custom template for generating list.

  npx @mctools/modlist --sort=/cf2Addon.downloadCount    Sort mods in resulted list by their download count
                                                         instead of by default ID.
  npx @mctools/modlist --output=modlist.md               Rename output list instead of default MODS.md

  npx @mctools/modlist --verbose                         Write some information in terminal
```

## API

To use as library:

1. Install package
  > ```shell
  > npm i @mctools/modlist
  > ```

2. Import functions from package.
  > ```ts
  > import fnc from '@mctools/modlist'
  > ```

## functions

### `generateModsList`

> **generateModsList**(`mcInstanceFresh`, `mcInstanceOld?`, `opts?`): `Promise`\<`string`\>

Generate modlist for given `minecraftinstance.json` file

### Parameters

#### mcInstanceFresh

`Minecraftinstance`

Json object from `minecraftinstance.json` of current version

#### mcInstanceOld?

`Minecraftinstance`

Json object from `minecraftinstance.json` of previous version.

#### opts?

[`ModListOpts`](../interfaces/ModListOpts.md)

Options for mod list generator

### Returns

`Promise`\<`string`\>

Markdown file based on given Handlebars template

## interfaces

### `ModListOpts`

Options for mod list generator

### Properties

#### ignore?

> `optional` **ignore**: `string`

.gitignore-like file content with mods to ignore.

##### See

modList

***

#### key

> **key**: `string`

CurseForge API key. Get one at https://console.curseforge.com/?#/api-keys

***

#### sort?

> `optional` **sort**: `string`

Sort field of CurseForge addon.
Accept deep path like `cf2Addon.downloadCount`.
`/` symbol at start of value flip sort order.

***

#### template?

> `optional` **template**: `string`

Custom Handlebars template to generate result

***

#### verbose?

> `optional` **verbose**: `boolean`

Output information about working process in stdout

## Author

* https://github.com/Krutoy242

## Other tools

