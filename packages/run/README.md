<h1 align="center">mct-run</h1>

Run several shell commands parralely

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-run --help
    ```

### Options

```shell
mct-run [config]

Positionals:
  config  Path to configuration JSON  [string] [default: "mct-run.json"]

Options:
      --version  Show version number  [boolean]
  -w, --cwd      Working derictory where scripts would be executed  [string]
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

- [mct-curseforge](https://github.com/Krutoy242/mc-tools/tree/master/packages/curseforge)
  > Lib for working with CurseForge using minecraftinstance.json
- [mct-errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors)
  > Scan debug.log file to find unknown errors
- [mct-format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format)
  > Format .zs files by using ESLint for typescript
- [mct-manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest)
  > `manifest.json` generation tool
- [mct-modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist)
  > Generate .md file with all mods listed
- [mct-reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer)
  > Partially disable minecraft mods
- [mct-tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon)
  > Tweaks Tinker Constructs' materials with csv tables
- [mct-utils](https://github.com/Krutoy242/mc-tools/tree/master/packages/utils)
  > Various utilities for Minecraft-Tools monorepo
