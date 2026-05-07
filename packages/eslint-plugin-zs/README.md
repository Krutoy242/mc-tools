<h1 align="center">@mctools/eslint-plugin-zs</h1>

ESLint plugin: lint and auto-format `.zs` (ZenScript) files using the `@mctools/format` pipeline (`peggyParse → ESLint → revert`) — without spawning a second ESLint instance.

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

## Roadmap

The package is intentionally minimal in v0. Designed extension points:

1. **Source-map-aware diagnostics.** Today residual TS-side lint errors point at TS coordinates. When `peggyParse` grows a real source map, swap the no-op in `src/sourceMap.ts` for the implementation — the rule already calls through it.
2. **Additional rules.** `src/rules/index.ts` is a registry: register a factory and it auto-appears on the plugin. Candidates: `prefer-val`, `no-unused-import`, `quote-style`.
3. **Per-file format options.** `defineConfig` currently uses one global adapter. To support different rule sets per `.zs` path, change it to accept `Array<{ files, tsConfig }>`.
4. **Watch-mode performance.** If profiling shows peggy is hot, memoize `zsToTs` results by source hash.
5. **Async adapters.** ESLint rules are sync today. Async adapters would require either ESLint's experimental async-rule support or a processor-based architecture.

## Author

* https://github.com/Krutoy242
