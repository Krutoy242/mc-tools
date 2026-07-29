<h1 align="center">@mctools/reducer</h1>

Partially disable minecraft mods

<!-- persistent_desc any other changes in this file except this block will be overwritten --><!-- /persistent_desc -->

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
Partially disable minecraft mods

AGENT LOOP (the common path)
  reducer restart --detach                 reboot (change mods first if you like), return at once
  reducer ready --wait                      block until the game is loaded & ready for commands
  reducer restart --only "Mod A"           block-reboot with only Mod A (+deps); reports LOAD + SCRIPTS

MORE
  reducer                                  open the interactive TUI (for humans)
  reducer restart --full                   reboot with every mod enabled
  reducer restart --disable A --enable B   combined; refuses self-excluding requests
  reducer ready                            answer once: is it ready right now? (exit 0/1)
  reducer status                           liveness + roster / diagnostics / weight
  reducer find jei thaum 1234              resolve queries → ./mods/<jar> paths
  reducer kill                             kill the running game
  reducer ./conditions.ts                  automated binary search (see below)
  reducer --continue / --new               resume / discard an interrupted session

Readiness is mod-agnostic: a pack declares extra signals (ready.logPattern /
ready.tcpPort) in reducer.config.yml; without them a bare Forge launch is still
detected via "FML loaded + log quiet". Add --dry/-y to log changes as "assumed". (@mctools/reducer v0.1.0)

USAGE @mctools/reducer [OPTIONS] restart|ready|kill|find|status|binary

OPTIONS

  -m, --cwd="./"    Minecraft dir with mods/ and minecraftinstance.json        
       -y, --dry    Dry run: change no files/processes; log status as "assumed"
     -f, --force    Binary search: ignore config validation problems           
  -c, --continue    Resume a previously interrupted session                    
       -n, --new    Discard an interrupted session and start fresh             
   -t, --trusted    Binary search: mods kept disabled (known-good)             
   -i, --ignored    Binary search: mods kept enabled (untouched)               

COMMANDS

  restart    Restart Minecraft; optionally change the mod set first                                                   
    ready    Is the game loaded & ready for commands right now? (mod-agnostic)                                        
     kill    Kill the running Minecraft process for this instance                                                     
     find    Resolve queries to ./mods/<jar> paths                                                                    
   status    Print the non-interactive dashboard (roster, diagnostics, weight)                                        
   binary    Automated binary search via a conditions.{ts,mjs,js} file (also runs as the bare reducer <config> form)

Use @mctools/reducer <command> --help for more information about a command.
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
