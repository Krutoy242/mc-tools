# MC-Tools

Automation tools for Minecraft modpack development.

<!-- 
```sh
node --experimental-specifier-resolution=node --no-warnings --loader ts-node/esm packages/errors/src/cli.ts --log=packages/errors/test/debug.log
```

https://www.kgajera.com/blog/how-to-test-yargs-cli-with-jest/
-->

## Tools

<!-- eval:start
return fast_glob
  .sync('packages/*/package.json')
  .map(f => [f, JSON.parse(fse.readFileSync(f, 'utf8'))])
  .filter(([, p]) => !p.private)
  .map(([f, p]) => `* [${p.name}](${f.replace(/.package\.json/, '')}) - ${p.description}`)
  .join('\n')
-->
* [@mctools/curseforge](packages/curseforge) - Lib for working with CurseForge using minecraftinstance.json
* [@mctools/errors](packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](packages/modlist) - Generate .md file with all mods listed
<!-- eval:end -->
