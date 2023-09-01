<h1 align="center">mct-tcon</h1>

Tweaks Tinker Constructs' materials with csv tables

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)
   
2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-tcon --help
    ```

### Options

```shell
Options:
      --version  Show version number  [boolean]
  -d, --default  Path default tweakersconstruct.cfg (with "Fill Defaults" enabled)  [string] [required]
  -m, --mc       Minecraft directory  [string] [default: "./"]
  -s, --save     Where to save new sorted stats  [string]
  -t, --tweaks   Directory with tweaks csv files  [string] [required]
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

- [mct-curseforge](https://github.com/Krutoy242/mc-tools/tree/master/packages/curseforge)
  > CLI tool and lib for working with CurseForge and its files (`minecraftinstance.json`, `manifest.json`)
- [mct-errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors)
  > Scan debug.log file to find unknown errors
- [mct-format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format)
  > Format .zs files by using ESLint for typescript
- [mct-reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer)
  > Partially disable minecraft mods
- [mct-run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run)
  > Run several shell commands parralely
- [mct-utils](https://github.com/Krutoy242/mc-tools/tree/master/packages/utils)
  > Various utilities for Minecraft-Tools monorepo
