<h1 align="center">@mctools/tcon</h1>

Tweaks Tinker Constructs' materials with csv tables

<!-- persistent_desc any other changes in this file except this block will be overwritten --><!-- /persistent_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/tcon --help
    ```

### Options

```shell
Tweaks Tinker Constructs' materials with csv tables (@mctools/tcon)

USAGE @mctools/tcon [OPTIONS] -d, --default -t, --tweaks

OPTIONS

  -d, --default (required)    Path to default tweakersconstruct.cfg (with "Fill Defaults" enabled)
             -m, --mc="./"    Minecraft directory                                                 
                -s, --save    Where to save new sorted stats                                      
   -t, --tweaks (required)    Directory with tweaks csv files
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [@mctools/source](https://github.com/Krutoy242/mc-tools/tree/master/packages/source) - Locate, clone or decompile Minecraft mod source code
* [@mctools/tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
* [@mctools/zsfind](https://github.com/Krutoy242/mc-tools/tree/master/packages/zsfind) - Look up ZenScript class definitions, fields and method signatures from CraftTweaker dumps
