<h1 align="center">@mctools/format</h1>

Format .zs files by using ESLint for typescript

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/format --help
    ```

### Options

```shell
Format .zs files by using ESLint for typescript (@mctools/format v0.0.0)

USAGE @mctools/format [OPTIONS] <FILES>

ARGUMENTS

  FILES    Path to file / files for formatting    

OPTIONS

  -i, --ignore    Same as --ignore-pattern for ESLint              
      -t, --ts    Create linted .ts file without converting it back
  -l, --nolint    Do not lint file
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
