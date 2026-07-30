# MC-Tools

Automation tools for Minecraft modpack development by Krutoy242.

## Overview

Monorepo of specialized CLI tools and libraries for Minecraft modpack
development and maintenance. TypeScript, ESM-only, pnpm workspaces.

Every package is usable both as a library (`src/index.ts`) and as a CLI
(`src/cli.ts`).

## Packages

| Package | Published | Description |
|---------|-----------|-------------|
| `@mctools/curseforge` | npm | Lib for working with CurseForge using `minecraftinstance.json` |
| `@mctools/errors` | npm | Scan `debug.log` to find unknown errors (also a CLI) |
| `@mctools/modlist` | npm | Generate a `.md` file listing all mods |
| `@mctools/manifest` | npm | `manifest.json` generation tool |
| `@mctools/tcon` | npm | Tweak Tinker Construct materials with CSV tables |
| `@mctools/format` | npm | Format `.zs` (ZenScript) via the ESLint TypeScript pipeline |
| `@mctools/eslint-plugin-zs` | npm | Lint/auto-format `.zs` via `@mctools/format`; also exports the shared flat config (`/config`) |
| `@mctools/reducer` | npm | Toggle Minecraft mods + restart/monitor the game. Interactive Ink TUI **and** non-interactive CLI, including automated `binary` search driven by a user `conditions.{ts,mjs,js}` file. React never loads in CLI mode |
| `@mctools/source` | npm | Locate a mod's source code — clone from CurseForge/GitHub metadata, or decompile the jar |
| `@mctools/zsfind` | npm | Look up ZenScript classes, fields and method signatures in CraftTweaker `.dzs` dumps |
| `@mctools/utils` | **never** | Shared utilities — bundled-only: `private`, inlined into consumers, never published |
| `@mctools/extension` | VS Code Marketplace (`vsce`) | "MC Tools: Modpack Dev Assistant" — `private` on npm |

## Architecture

`mc-tools` turns the artifacts a Minecraft 1.12.2 modpack produces —
`minecraftinstance.json`, `mods/*.jar`, `logs/debug.log`, `crafttweaker.log`,
mod configs, CraftTweaker `.dzs` dumps, `.zs` scripts — into things a pack
developer can act on: a rendered `MODS.md`, a CurseForge `manifest.json`,
filtered error reports, formatted ZenScript, located mod sources, and a reduced
mod set that reproduces a bug.

### Bird's Eye View

Almost every tool starts from the same two inputs — the CurseForge instance
manifest and the `mods/` folder — and differs only in what it derives from them:

```
minecraftinstance.json ──▶ curseforge (parse, diff, enrich via CF API, cache)
                              ├─▶ modlist  ─▶ MODS.md (Handlebars + changelogs)
                              ├─▶ manifest ─▶ manifest.json
                              ├─▶ source   ─▶ cloned / decompiled mod source folder
                              └─▶ reducer  ─▶ toggled .jar/.disabled + game restart
logs/debug.log ───────────▶ errors ─▶ filtered error list / exit code
scripts/*.zs ─────────────▶ format ─▶ eslint-plugin-zs ─▶ formatted .zs
ct-dump/**/*.dzs ─────────▶ zsfind ─▶ class / field / method signatures
```

Four packages are leaves owning a vocabulary the rest reuse: `curseforge`
(instance schema and all CurseForge HTTP access), `utils` (tiny shared helpers),
`format` (the ZenScript↔TypeScript transform), and `zsfind` (fully standalone).
`extension` is the only sink — it re-exposes `errors`, `modlist`, `manifest` and
`curseforge` inside VS Code, and nothing depends on it.

### Code Map

Ordered by dependency direction: leaves first, consumers after. Pay attention to
**Boundary** and **Invariant** callouts. Entities are named, not linked — find
them by symbol search.

#### `packages/utils/`

Dependency-free helpers: `naturalSort`, `assertPath` (CLI path validation),
`Lang` (lang-file read/write), `matchAddons`/`purifyFileName` (fuzzy mod-name
resolution, exposed as the `mod-resolve` subpath), plus FTB Quests SNBT, TellMe
CSV and Recurrent Complex `.rcst` readers. Built unbundled so every subpath
export stays individually importable.

The `reccomplex` subpath reads and writes Recurrent Complex structures
(`.rcst` = zip of `structure.json` + gzipped `worldData.nbt`): `readRcst` /
`writeRcst` / `parseRcst` / `serializeRcst`, the block accessors `getBlock`,
`setBlock`, `positionsOf`, `replaceBlock`, `paletteIndex`, `index`, `tilePos`,
and the pre-1.11 rename tables `LEGACY_TILE_ENTITY_IDS`, `LEGACY_ENTITY_IDS`,
`modernEntityId`. Blocks are a palette plus one MSB-first bit-packed index and
one metadata byte per position, ordered `x + width * (y + height * z)`.

**Invariant:** `.rcst` round-trips byte-for-byte — `serializeRcst(parseRcst(b))`
must equal `b`, so an edit script only changes what it meant to change. The zip
container is handled in-package over `node:zlib`; nothing shells out to `7z`.

**Invariant:** every third-party parser (`csv-parse`, `ftbq-nbt`,
`prismarine-nbt`) is an *optional* peer dependency imported only by its own
subpath — importing `@mctools/utils` itself stays dependency-free.

**Invariant:** `@mctools/utils` is `private` and never published. Consumers list
it under `devDependencies` only and inline it at build time, so published
tarballs are self-contained. It must never appear in a `dependencies` block.

**Invariant:** imports no other `@mctools/*` package.

#### `packages/curseforge/`

Parses `minecraftinstance.json`, diffs two instances, and enriches addons from
the CurseForge API. Key types: `Minecraftinstance`, `InstalledAddon`,
`InstalledFile`, `ModsComparison`, `AddonDifference`, `ChangelogEntry`, and the
branded `AddonID` / `FileID`. Key functions: `loadMCInstanceFiltered`,
`modListDiff`, `modListUnion`, `fetchMod(s)`, `fetchFile(s)`,
`fetchChangelog(s)`, `setCachePath`.

**Boundary:** the `./minecraftinstance` subpath export is the repo's shared data
vocabulary — `modlist`, `manifest`, `reducer`, `source` and `extension` speak
these types instead of re-parsing the instance JSON themselves.

**Invariant:** the only package that constructs a CurseForge API client, so
caching and the `CF_API_KEY` fallback stay in one place. Responses memoise to an
on-disk JSON cache.

**Invariant:** imports no other `@mctools/*` package.

#### `packages/format/`

Formats ZenScript by round-tripping it through TypeScript: a Peggy grammar emits
marker-laden TS, an external linter `--fix`es it, and a regex reverse pass
restores ZS. Key exports: `zsToTs`, `revert`, `formatZs`, `createBatchAdapter`;
the marker protocol shared by both passes lives in one module.

**Boundary:** `LintAdapter` (`fix(tsSource, virtualFilename) -> LintFixResult`)
is the seam between "convert ZS↔TS" and "run ESLint". The CLI supplies a batch
adapter over real files; `eslint-plugin-zs` supplies an in-process one. A third
lint host means implementing this interface and nothing else.

**Invariant:** the public API is filesystem-free — every exported function is
string-in, string-out. All I/O lives in the CLI/file wrapper.

**Invariant:** the Peggy parser is a pre-generated artifact copied verbatim into
`dist` and kept external from the bundler; forward and reverse passes must agree
on marker spelling.

#### `packages/eslint-plugin-zs/`

ESLint flat-config plugin that lints and auto-formats `.zs` through
`@mctools/format`, plus the shared repo style config. Key exports:
`defineConfig`, `zsParser`, `buildRules`, `createInProcessAdapter`, and
`defineMctoolsConfig` on the `./config` subpath.

**Boundary:** `defineMctoolsConfig` is the single source of truth for
lint/format style, consumed by this repo's root config *and* by the parent
Enigmatica2Expert-Extended modpack repo. Style changes belong here, not in
per-repo overrides.

**Invariant:** the plugin reuses the host's existing TS flat config to lint the
generated TS — it never constructs a second `ESLint` instance. Type-aware rules
are explicitly disabled for ZS-derived TS, which has no real tsconfig project.

**Invariant:** the only workspace package taking `@mctools/format` as a runtime
`dependency`.

#### `packages/errors/`

Scans `debug.log` using a YAML rule file (boundaries / match / ignore / replace
/ groupBy). Key types: `Config`, `CompiledConfig`, `FoundError`; key functions
`parseConfig`, `compileConfig`, `compileConfigFromYaml`, `findErrors`.

**Boundary:** `findErrors(text, config)` is pure — text in, `FoundError[]` out.
The CLI, the VS Code diagnostics engine and the tests all call this one
function.

#### `packages/modlist/`

Renders a Markdown mod list from an instance diff via a Handlebars template,
optionally enriching entries with changelogs scraped from CurseForge, GitHub
compare links and Modrinth. Key export: `generateModsList(opts: ModListOpts)`.
Changelog cleanup heuristics live in their own submodule.

**Invariant:** changelog fetching is skipped entirely unless the active template
renders a `changelog` field — network cost is template-driven.

#### `packages/manifest/`

Generates and incrementally updates a CurseForge `manifest.json` from the
instance file. Key types: `ModpackManifest`, `ModpackManifestFile`,
`ManifestGenerationOptions`; `formatModList` emits deterministic
column-aligned JSON.

**Invariant:** the emitted layout is stable by construction — the formatter
exists so regenerating a manifest produces a minimal git diff.

#### `packages/source/`

Locates a mod's source code. `findModSource(query, options)` walks a fixed
ladder: local folder / index cache → clone from instance+CurseForge metadata →
clone from jar metadata + GitHub search → same-author / LLM-assisted guess →
decompile the jar with a local CFR or Vineflower. Key types: `Ctx`, `Logger`,
`InstanceAddon`; key helpers `resolveContext`, `decompileMod`,
`readJarManifest`.

**Boundary:** `Ctx` (source root, instance dir, API key, log sink) is threaded
through every step; steps never read env vars or `process.cwd()` themselves.
`resolveContext` is the one place env fallbacks (`MOD_SOURCES`, `CF_API_KEY`)
are applied.

**Invariant:** every step is best-effort and returns `null` rather than
throwing, so the ladder can always fall through to the next strategy.

**Invariant:** a resolved folder is pinned to the version the pack installs, not
merely to a 1.12.x branch — `syncToInstalledVersion` pulls, then falls back to a
matching tag or a history scan of the version-declaring file. Pinning detaches
HEAD, so the branch it came from is stored in the repo's own git config
(`mctools.sourceBranch`) and restored on the next run.

**Invariant:** the query is a modid, but `minecraftinstance.json` has no modid
field — so `findModJar` trusts the addon ranker only on an exact reason and
otherwise prefers a jar declaring that modid (`jei` is Had Enough Items, not JEI
Bees). Every later step takes its addon from that jar, not from the ranker.

#### `packages/reducer/`

Bisects a modpack: toggles mods on/off, launches and monitors the game, and
binary-searches for the minimal mod set reproducing a bug. Key types: `Mod`,
`ModStore`, `ReducerConfig`, `Branch`, `Launcher`, `MonitorResult`,
`Conditions`/`ConditionContext`, `SessionState`. Non-interactive verbs live in
the core command layer; the Ink/React TUI lives in a separate UI subtree.

**Boundary:** `Launcher` abstracts "how do we start/stop Minecraft here".
PrismLauncher is the bundled default; a pack overrides it via config, so the
package is not hard-wired to one launcher.

**Boundary:** `Conditions` (`isTestEnded` / `isBugFound`, authored with
`defineConditions`) is the user-supplied verdict function for automated
bisection, loaded from a `.ts`/`.mjs`/`.js` file at runtime. This is the only
place user code is executed.

**Invariant:** React and Ink load only on the interactive TUI path; CLI verbs
never import the UI subtree, so agents and scripts pay no React startup cost.

**Invariant:** mod state and bisection progress persist to a session file beside
the instance, and drift (mods changed behind the tool's back) is detected
explicitly rather than assumed away.

#### `packages/zsfind/`

Looks up ZenScript class definitions, fields and method signatures from
CraftTweaker `.dzs` dumps (standard and native trees). Key types: `Source`,
`ParsedDzs`, `Member`, `Match`, `Resolution`, `Suggestion`; key functions
`loadSources`, `parseDzs`, `findMembers`, `expandTypes`, `resolveQuery`,
`suggest`. Exact, fuzzy (Levenshtein) and regex queries; file index cached in
the user cache dir and invalidated by dump mtime.

**Invariant:** depends on no other `@mctools/*` package and does no network I/O.

#### `packages/tcon/`

Recomputes Tinkers' Construct material stats from CSV tables and emits config
lines for `tweakerconstruct.cfg`, with a rendered comparison table. Key types:
`TweakName`, `TweakObj`, `TweakedMaterial`, `MatTraits`.

**Invariant:** targets only the TweakerConstruct config; never touches the
instance manifest or `mods/`.

#### `packages/extension/`

VS Code extension ("MC Tools: Modpack Dev Assistant") hosting three features:
debug-log diagnostics (over `@mctools/errors`), CraftTweaker log diagnostics
with per-error-kind parsers, and a mod-tracker tree view that maps changed files
to mods and drives MODS.md / manifest regeneration through the git extension
API.

**Boundary:** the only consumer of `vscode` APIs in the repo. Feature modules
receive a logger, a diagnostics manager and a plain config object; they never
read VS Code settings directly.

**Invariant:** `private: true` — published to the VS Code Marketplace via
`vsce`, never to npm. Its build bundles *all* dependencies, with only `vscode`
left external.

**Invariant:** nothing depends on `extension`; it is a leaf consumer.

#### `scripts/`

Repo-local automation outside any package: README generation (runs each CLI's
`--help` and embeds the output), FTB Quests helpers, one-off pack utilities.

**Invariant:** never published and never imported by a package — flow is
one-directional, `scripts/` → `packages/`.

## Cross-Cutting Concerns

### Tech stack

- **Runtime**: Node.js >= 24 · **Language**: TypeScript (ESM, strict)
- **Package manager**: pnpm (`pnpm-workspace.yaml`) — `workspace:*` protocol
- **Build**: `tsdown` · **Tests**: `vitest` · **CLI framework**: `citty`
- **Lint/format**: ESLint flat config from `@mctools/eslint-plugin-zs/config`
- **CI/CD**: GitHub Actions — build + test + lint on Ubuntu & Windows;
  `semantic-release` on push to the main branch

### Package shape and CLI conventions

Every package is ESM-only, exports `./dist/*.mjs` with `.d.mts` types, and ships
only `dist/`. A tool package pairs a side-effect-free `src/index.ts` (library
surface) with a `src/cli.ts` built on `citty`. Shared package.json fields live
in a template at the `packages/` root and are merged into each package by a
lint-staged hook, keeping metadata uniform.

**Invariant:** `src/index.ts` never parses argv, prints usage, or sets an exit
code; `cli.ts` is the only argv surface, and it guards `runMain` behind a
realpath "am I the entry module" check so tests can import the command
definition without executing it.

**Invariant:** `bin` points at `src/cli.ts` (runnable in-workspace via `tsx`)
and is rewritten by `publishConfig.bin` to `dist/cli.mjs` for the tarball — both
must stay in sync.

### Error handling

Libraries throw `Error` with actionable messages (config validation via `zod` in
`errors` and `reducer`); CLIs catch at the top level, write to stderr and set
`process.exitCode` rather than calling `process.exit`. Resolution-style paths
(`source`, mod matching) return `null` or an "ambiguous" result instead of
throwing, so callers can fall through or refuse to act on a guess.

### Build

`tsdown` builds every package to ESM + declarations. The architectural part is
bundling policy: `@mctools/utils` is always inlined by consumers
(`deps.alwaysBundle`), `extension` inlines everything except `vscode`, and `utils`
itself is built unbundled (`unbundle: true`) so its subpath exports survive.

### Testing

`vitest` with a root config aggregating per-package projects, and a shared alias
table mapping `@mctools/<pkg>[/<sub>]` specifiers to package sources. Fixtures
are checked in per package; line endings are forced to LF repo-wide
(`.gitattributes`) because fixture comparisons assume it.

**Invariant:** tests run against `src/`, never `dist/` — no build step is needed
to test, and a stale `dist/` can never make tests pass.

### Lint, hooks and CI

One flat config for the whole repo from `defineMctoolsConfig` — the same config
the modpack repo consumes; generated artifacts (READMEs, the Peggy parser,
runtime caches) are ignored there rather than per-directory. `core.hooksPath`
points at repo-local hooks (works in submodule/worktree checkouts): pre-commit
runs lint-staged, pre-push checks lockfile integrity and runs only the tests
affected by the pushed commits. The full build+test matrix (Linux + Windows)
runs in CI.

### Release

`semantic-release` runs once per package; bumps are commit-driven
(Conventional Commits — only `fix:`/`feat:` bump, `build:`/`ci:`/`chore:` do
not) and tags use a `@scope/name-vX.Y.Z` format.

**Invariant:** releases are dependency-aware — the commit filter matches a
package's own folder *or* any transitive `workspace:` dependency folder, so a
change in a bundled dependency republishes every consumer that inlines it.
Publishing goes through `pnpm publish` (never `npm publish`), because only pnpm
rewrites `workspace:*` specifiers at pack time.

**Invariant:** `utils` and `extension` are excluded from the release run by
name; every other package under `packages/` is published to npm.
