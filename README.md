# MC-Tools

Automation tools for Minecraft modpack development.

<!-- 
```sh
node --experimental-specifier-resolution=node --no-warnings --loader ts-node/esm packages/errors/src/cli.ts --log=packages/errors/test/debug.log
```

https://www.kgajera.com/blog/how-to-test-yargs-cli-with-jest/
-->

## tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/format](https://github.com/Krutoy242/mc-tools/tree/master/packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/manifest](https://github.com/Krutoy242/mc-tools/tree/master/packages/manifest) - `manifest.json` generation tool
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](https://github.com/Krutoy242/mc-tools/tree/master/packages/reducer) - Partially disable minecraft mods
* [@mctools/run](https://github.com/Krutoy242/mc-tools/tree/master/packages/run) - Run several shell commands parralely
* [@mctools/tcon](https://github.com/Krutoy242/mc-tools/tree/master/packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
