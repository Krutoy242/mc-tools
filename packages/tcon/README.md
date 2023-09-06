<h1 align="center">@mctools/tcon</h1>

Tweaks Tinker Constructs' materials with csv tables

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `mods/` directory or `options.txt` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx @mctools/tcon --help
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


* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
