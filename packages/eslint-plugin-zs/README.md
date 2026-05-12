<h1 align="center">@mctools/eslint-plugin-zs</h1>

ESLint plugin: lint and auto-format .zs (ZenScript) via @mctools/format

<!-- extended_desc -->
The plugin lets `eslint .` (or `eslint --fix .`) participate in formatting `.zs` files alongside the host project's TS rules. The host project's flat config is reused verbatim against an in-process `Linter` to fix the marker-laden TypeScript produced from each `.zs` source — no second `new ESLint(...)` is created at runtime.

**Requirements:**
* `eslint@^9` and `@mctools/format` are **peer dependencies**.

**Wiring:**

```js
// eslint.config.js
import antfu from '@antfu/eslint-config'
import zs from '@mctools/eslint-plugin-zs'

const tsConfig = await antfu({ /* your normal options */ })

export default [
  ...tsConfig,
  ...zs.defineConfig({ tsConfig }),
]
```

`defineConfig` returns a flat-config fragment that registers the parser stub for `*.zs`, the plugin object, and the `zs-format` rule.
<!-- /extended_desc -->

## Usage

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
