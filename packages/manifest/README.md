<h1 align="center">@mctools/manifest</h1>

`manifest.json` generation tool

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/manifest --help
    ```

### Options

```shell
Options:
      --version     Show version number  [boolean]
  -v, --verbose     Log working process in stdout  [boolean]
  -i, --ignore      Path to ignore file similar to .gitignore
  -k, --key         Path to file with CurseForge API key  [required]
  -m, --mcinstance  Path to minecraftinstance.json  [default: "minecraftinstance.json"]
  -h, --help        Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
