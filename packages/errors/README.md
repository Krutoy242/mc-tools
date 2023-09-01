<h1 align="center">mct-errors</h1>

Scan debug.log file to find unknown errors

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)
   
2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-errors --help
    ```

### Options

```shell
Options:
      --version  Show version number  [boolean]
  -o, --output   Path for output with errors. If not specified output into stdout.  [string]
  -l, --log      debug.log file path (may need to be enabled by launcher)  [string] [default: "logs/debug.log"]
  -c, --config   Path to .yml file with configs  [string] [default: "D:\mc_client\Instances\E2E-E\mc-tools\packages\errors\src\config.yml"]
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

- [mct-curseforge](https://github.com/Krutoy242/mc-tools/tree/master/packages/curseforge)
  > CLI tool and lib for working with CurseForge and its files (`minecraftinstance.json`, `manifest.json`)
- [mct-format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format)
  > Format .zs files by using ESLint for typescript
- [mct-reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer)
  > Partially disable minecraft mods
- [mct-run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run)
  > Run several shell commands parralely
- [mct-tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon)
  > Tweaks Tinker Constructs' materials with csv tables
- [mct-utils](https://github.com/Krutoy242/mc-tools/tree/master/packages/utils)
  > Various utilities for Minecraft-Tools monorepo
