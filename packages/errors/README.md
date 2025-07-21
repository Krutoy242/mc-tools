<h1 align="center">@mctools/errors</h1>

Scan debug.log file to find unknown errors

<!-- extended_desc -->
<!--

To create preview of this console app, you need to follow this steps:

## 4. Start demo

> asciinema rec demo.cast --overwrite

## 5. Follow scenario

> agg demo.cast demo.gif
> npx svg-term-cli --in demo.cast --out demo.svg

-->
![Terminal usage example](https://i.imgur.com/7olLeDS.gif)

In large modpacks, the `debug.log` file can contain hundreds of thousands of lines. This tool filters out unimportant and cluttered messages, leaving only the most critical ones.

**Features:**
*   **Log Trimming:** Can cut the log file to a specific point (e.g., before the player joins the world).
*   **Message Sanitizing:** Replaces parts of messages for better readability (removes timestamps, hash codes, UUIDs).
*   **Stack Trace Shortening:** Truncates long stack traces.
*   **Error Grouping:** Groups identical errors together.
*   **Advanced Filtering:** Ignores a huge number of known harmless errors and warnings from many mods.
<!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/errors --help
    ```

### Options

```shell
Options:
      --version  Show version number  [boolean]
  -o, --output   Path for output with errors. If not specified output into stdout.  [string]
  -l, --log      debug.log file path (may need to be enabled by launcher)  [string] [default: "logs/debug.log"]
  -c, --config   Path to .yml file with configs  [string] [default: "packages\errors\src\config.yml"]
  -h, --help     Show help  [boolean]
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
