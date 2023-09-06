<h1 align="center">@mct/run</h1>

Run several shell commands parralely

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `mods/` directory or `options.txt` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx @mct/run --help
    ```

### Options

```shell
@mct/run [config]

Positionals:
  config  Path to configuration JSON  [string] [default: "@mct/run.json"]

Options:
      --version  Show version number  [boolean]
  -w, --cwd      Working derictory where scripts would be executed  [string]
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools


* [@mct/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
