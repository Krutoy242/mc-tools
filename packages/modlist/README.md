<h1 align="center">mct-modlist</h1>

Generate .md file with all mods listed

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-modlist --help
    ```

### Options

```shell
Options:
      --version     Show version number  [boolean]
  -v, --verbose     Log working process in stdout  [boolean]
  -i, --ignore      Path to ignore file similar to .gitignore
  -k, --key         Path to file with CurseForge API key  [required]
  -m, --mcinstance  Path to minecraftinstance.json  [default: "minecraftinstance.json"]
  -l, --old         Path to old minecraftinstance.json to compare with  [string]
  -t, --template    Path to Handlebar template
  -o, --output      Path to output file  [default: "MODS.md"]
  -s, --sort        Sort field of CurseForge addon. Accept deep path like `cf2Addon.downloadCount`. `/` symbol at start of value flip sort order.  [default: "addonID"]
  -h, --help        Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools


* [mct-errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [mct-format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [mct-manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [mct-reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [mct-run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run) - Run several shell commands parralely
* [mct-tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
