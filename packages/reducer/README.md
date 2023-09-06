<h1 align="center">@mctools/reducer</h1>

Partially disable minecraft mods

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `mods/` directory or `options.txt` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx @mctools/reducer --help
    ```

### Options

```shell
@mctools/reducer [command]

Commands:
  @mctools/reducer levels <path>  Select reduce level with prompt
  @mctools/reducer binary         Reduce mods in half to find error
  @mctools/reducer interactive    Pick mods and manipulate them one by one

Options:
      --version  Show version number                                   [boolean]
  -m, --mods     Minecraft mods/ folder path          [string] [default: "mods"]
  -h, --help     Show help                                             [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools


* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
