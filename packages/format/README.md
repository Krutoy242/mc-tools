<h1 align="center">mct-format</h1>

Format .zs files by using ESLint for typescript

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)
   
2. Open console, navigate to your Minecraft directory (one with the `logs/` directory or `crafttweaker.log` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx mct-format --help
    ```

### Options

```shell
mct-format <files>

Positionals:
  files  Path to file / files for formatting  [string]

Options:
      --version  Show version number  [boolean]
  -t, --ts       Create linted .ts file without converting it back.  [boolean]
  -l, --nolint   Do not lint file
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

- [mct-curseforge](https://github.com/Krutoy242/mc-tools/tree/master/packages/curseforge)
  > CLI tool and lib for working with CurseForge and its files (`minecraftinstance.json`, `manifest.json`)
- [mct-errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors)
  > Scan debug.log file to find unknown errors
- [mct-reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer)
  > Partially disable minecraft mods
- [mct-run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run)
  > Run several shell commands parralely
- [mct-tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon)
  > Tweaks Tinker Constructs' materials with csv tables
- [mct-utils](https://github.com/Krutoy242/mc-tools/tree/master/packages/utils)
  > Various utilities for Minecraft-Tools monorepo
