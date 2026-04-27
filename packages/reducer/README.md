<h1 align="center">@mctools/reducer</h1>

Partially disable minecraft mods

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/reducer --help
    ```

### Options

```shell
Partially disable minecraft mods (@mctools/reducer v0.0.0)

USAGE @mctools/reducer [OPTIONS] 

OPTIONS

  -m, --cwd="./"    Minecraft dir with mods/ and minecaftinstance.json
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
