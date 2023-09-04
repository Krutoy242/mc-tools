<h1 align="center">mct-reducer</h1>

Partially disable minecraft mods

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-reducer --help
    ```

### Options

```shell
mct-reducer [command]

Commands:
  mct-reducer levels <path>  Select reduce level with prompt
  mct-reducer binary         Reduce mods in half to find error
  mct-reducer interactive    Pick mods and manipulate them one by one

Options:
      --version  Show version number                                   [boolean]
  -m, --mods     Minecraft mods/ folder path          [string] [default: "mods"]
  -h, --help     Show help                                             [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools


* [mct-errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [mct-format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [mct-manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [mct-modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [mct-run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run) - Run several shell commands parralely
* [mct-tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
