<h1 align="center">@mctools/errors</h1>

Scan debug.log file to find unknown errors

<!-- extended_desc -->
<!--

To create preview of this console app, you need to follow this steps:

## 1. Create syntax rules

`debug.log.sublime-syntax`:
```
%YAML 1.2
---
name: Minecraft Log
scope: text.log.minecraft
file_extensions:
  - log

contexts:
  main:
    # Dim timestamp
    - match: '^\[\d{2}:\d{2}:\d{2}\]'
      scope: comment

    # Client thread
    - match: 'Client thread(/|\\)'
      scope: comment

    # Log levels for non-dimmed lines
    - match: '(?i)(INFO)\]'
      scope: keyword
    - match: '(?i)(WARN|WARNING)\]'
      scope: string.regexp
    - match: '(?i)(ERROR|FATAL|SEVERE|EXCEPTION|FAILED)\]'
      scope: invalid

    # Mod ID in brackets
    - match: '\[([^\]\s]+)\]:'
      captures:
        1: entity.name.tag

    # Java class paths and packages
    - match: '\b([a-zA-Z_][a-zA-Z0-9_]*\.)+([a-zA-Z_][a-zA-Z0-9_.$]*)\b'
      scope: entity.name.class

    # File names (jars, configs, etc.)
    - match: '([a-zA-Z0-9_.\-+\[\]]+?\.jar)\b'
      scope: string
    - match: '\b\w+_at\.cfg\b' # Access Transformer files
      scope: string.unquoted
    - match: 'mixins\.[a-zA-Z0-9_.-]+\.json' # Mixin JSON files
      scope: string.unquoted

    # File paths
    - match: '([A-Za-z]:)?([\/][\w\s.\()%~-]+)+[\/]?'
      scope: string.quoted.single

    # Version numbers
    - match: '\b\d{1,3}(\.\d+)+([-.+]?[a-zA-Z0-9_.-]+)?\b'
      scope: constant.numeric

    # Hexadecimal hashes
    - match: '\b[0-9a-fA-F]{16,}\b'
      scope: constant.other.symbol

    # Mixin annotations
    - match: '@(Inject|ModifyArg|Redirect|ModifyVariable|ModifyConstant|Overwrite|Shadow|Accessor|Invoker|Mixin)'
      scope: keyword.control

    # Stack traces
    - match: '^\s*at\s+'
      push: stack-trace
    - match: 'Caused by:'
      scope: invalid

  dim-line:
    - meta_scope: comment
    - match: '$'
      pop: true

  stack-trace:
    - meta_scope: meta.stack-trace
    - match: '^\s*at\s+((?:[a-zA-Z0-9_]+\.)+[a-zA-Z0-9_.$<>]+)\(([^)]*)\)'
      captures:
        1: entity.name.function
        2: string.quoted.double
    - match: '^\s*... \d+ more'
      scope: comment
      pop: true
    - match: '(?=Caused by:)'
      pop: true
    - match: '(?=^\[\[\])'  # Lookahead for start of a new log line
      pop: true
    - match: '$'
      pop: true
```

## 2. Apply syntax

> mkdir -p "$(bat --config-dir)/syntaxes" && cp debug.log.sublime-syntax "$(bat --config-dir)/syntaxes/" && bat cache --build

## 3. Apply configs

> echo -e '--theme="TwoDark"\n--wrap=never\n--map-syntax="*debug.log:Minecraft Log"' > "$(bat --config-file)"

## 4. Start demo

> asciinema rec demo.cast --overwrite

## 5. Follow scenario

> bat logs/debug.log
> npx @mctools/errors --config=mct-errors-config.yml > logs/short.debug.log
> bat logs/short.debug.log

## 6. Save .gif or .svg

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
