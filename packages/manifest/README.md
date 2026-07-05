<h1 align="center">@mctools/manifest</h1>

`manifest.json` generation tool

<!-- persistent_desc any other changes in this file except this block will be overwritten --><!-- /persistent_desc -->

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
manifest.json generation tool (@mctools/manifest)

USAGE @mctools/manifest [OPTIONS] 

OPTIONS

                              -v, --verbose    Log working process in stdout                                                                                                                   
                               -i, --ignore    Path to ignore file similar to .gitignore                                                                                                       
                                  -k, --key    CurseForge API key or path to file containing it. Get one at https://console.curseforge.com/?#/api-keys. If omitted, CF_API_KEY env var is used.
  -m, --mcinstance="minecraftinstance.json"    Path to minecraftinstance.json                                                                                                                  
                                     --name    Override pack name (default: autodetect from cwd)                                                                                               
                               --mc-version    Override Minecraft version (default: autodetect from minecraftinstance.json/debug.log)                                                          
                               --project-id    Override CurseForge project ID (default: read from existing manifest.json)                                                                      
                             --pack-version    Pack version to write into manifest                                                                                                             
                                  --postfix    Suffix for output file: manifest<postfix>.json
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [@mctools/format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [@mctools/source](https://github.com/Krutoy242/mc-tools/tree/master/packages/source) - Locate, clone or decompile Minecraft mod source code
* [@mctools/tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
* [@mctools/zsfind](https://github.com/Krutoy242/mc-tools/tree/master/packages/zsfind) - Look up ZenScript class definitions, fields and method signatures from CraftTweaker dumps
