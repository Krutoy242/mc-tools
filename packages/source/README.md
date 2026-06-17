<h1 align="center">@mctools/source</h1>

Locate, clone or decompile Minecraft mod source code

<!-- extended_desc -->
The resolved absolute path is printed to **stdout**; all diagnostics go to **stderr**, so the result is easy to capture.

### Resolution pipeline

1. **Local match** — existing folder / `.index.yaml` under `$MOD_SOURCES`, checked out to a `1.12.x` branch.
2. **Clone** — GitHub/GitLab URL from `minecraftinstance.json` or the CurseForge API (`$CF_API_KEY`).
3. **Jar metadata** — `mcmod.info` / `META-INF/MANIFEST.MF`, then a GitHub search by author or name.
4. **Same author / Gemini** — repos of other mods by the same author, or the `gemini` CLI.
5. **Decompile** — `cfr*.jar` (in the MC dir) or `vineflower*.jar` (in `$MOD_SOURCES`).

<!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/source --help
    ```

### Options

```shell
@mctools/source <query> [options]

Locate, clone or decompile the source code of a Minecraft 1.12.2 mod.
The resolved absolute path is printed to stdout; diagnostics go to stderr.

Positionals:
  query  Mod id, name, or jar filename fragment  [string]

Options:
      --version  Show version number  [boolean]
  -m, --mc       Minecraft instance directory (default: cwd)  [string]
  -s, --sources  Directory holding mod sources (default: $MOD_SOURCES)  [string]
  -k, --key      CurseForge API key (default: $CF_API_KEY)  [string]
      --silent   Suppress diagnostic logging  [boolean]
  -h, --help     Show help  [boolean]
```

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
