<h1 align="center">@mctools/utils</h1>

Various utilities for Minecraft-Tools monorepo, intended to be bundled not dependent

<!-- extended_desc --><!-- /extended_desc -->

## Usage

## API

1. Install package
  > ```shell
  > npm i @mctools/utils
  > ```

2. Import functions from package.
  > ```ts
  > import fnc from '@mctools/utils'
  > ```

## functions

### `naturalSort`

> **naturalSort**(`a`, `b`): `number`

Natural string comparator — sorts "mod-v2" before "mod-v10".
Meant for `Array.prototype.sort(naturalSort)`.

- `a` `string`
- `b` `string`

**Returns:** `number`
## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [@mctools/source](https://github.com/Krutoy242/mc-tools/tree/master/packages/source) - Locate, clone or decompile Minecraft mod source code
* [@mctools/tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
