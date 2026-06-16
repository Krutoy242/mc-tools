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
* [@mctools/eslint-plugin-zs](packages/eslint-plugin-zs) - ESLint plugin: lint and auto-format .zs (ZenScript) via @mctools/format
* [@mctools/format](packages/format) - Format .zs files by using ESLint for typescript
* [@mctools/manifest](packages/manifest) - `manifest.json` generation tool
* [@mctools/modlist](packages/modlist) - Generate .md file with all mods listed
* [@mctools/reducer](packages/reducer) - Partially disable minecraft mods
* [@mctools/tcon](packages/tcon) - Tweaks Tinker Constructs' materials with csv tables
<!-- eval:end -->

## Monorepo structure

- pnpm workspace; every package lives in `packages/*`, is ESM-only and built with `unbuild`.
- `@mctools/utils` is **bundled-only**: `private`, inlined into consumers (kept in their `devDependencies`), never published.
- Shared ESLint flat config comes from `@mctools/eslint-plugin-zs/config`.
- Releases run on push to `master` via `semantic-release` + `pnpm publish`; only `fix:`/`feat:` commits bump versions.

## Adding a new package

1. `mkdir packages/<name>` with `package.json` (name `@mctools/<name>`, `"type": "module"`), `src/index.ts` and a `README.md`.
2. Copy the build/test scripts from `packages/package.json`; run `node merge_jsons.js packages/<name>/package.json` to sync shared fields.
3. If it imports `@mctools/utils`, add it to `devDependencies` and inline it: `build.config.ts` → `rollup: { inlineDependencies: [/@mctools\/utils(\/|$)/] }`.
4. Add path aliases to root `tsconfig.json`; `pnpm install`; add `vitest` tests under `test/`.
5. Keep it `private: true` until ready to publish.
