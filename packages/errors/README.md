<h1 align="center">@mct/errors</h1>

Scan debug.log file to find unknown errors

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `mods/` directory or `options.txt` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx @mct/errors --help
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


* [@mct/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
