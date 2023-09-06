<h1 align="center">@mct/format</h1>

Format .zs files by using ESLint for typescript

<!-- extended_desc --><!-- /extended_desc -->

## Usage

1. Install latest **NodeJS** for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the `mods/` directory or `options.txt` file)
   ```sh
   > cd C:/Instances/MyModpack
   ```

3. Run:
    ```sh
    > npx @mct/format --help
    ```

### Options

```shell
@mct/format <files>

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


* [@mct/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
