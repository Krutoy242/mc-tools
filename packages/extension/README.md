<h1 align="center">mc-tools-vscode</h1>

VS Code extension for Minecraft 1.12.2 modpack development automation

<!-- persistent_desc any other changes in this file except this block will be overwritten -->
## Features

### Debug Log Monitor
- Incrementally parses `logs/debug.log` using `@mctools/errors`
- Shows errors and warnings as VSCode Diagnostics
- Parses from the start of the log, where Minecraft writes its mod-loading
  errors, then tails the rest — line numbers are counted incrementally as the
  log grows, so the file is never re-read
- Supports log truncation detection on Minecraft restart
- Caps the Problems panel via `mc-tools.debugLog.maxDiagnostics`

### CraftTweaker Log Monitor
- Parses `crafttweaker.log` with custom parsers:
  - **Mixin parser** — maps mixin fatal errors back to `.zs` source files
  - **Script parser** — resolves `__script__(file.zs:line)` stack traces
  - **Generic parser** — fallback for all `[FATAL|ERROR|WARNING]` lines
- Rescans when `.zs` files are saved, patching only the saved script in the
  mixin index instead of rewalking every script in the pack
- Clears diagnostics for scripts that no longer have findings

### Mod Tracker
- Detects mod changes by diffing `minecraftinstance.json` against git HEAD
- Groups changed `config/*` files by mod using fuzzy name matching
- Shows changes in a dedicated **Mod Changes** Explorer panel
- Supports staging files per-mod or all at once
- Skips paths inside git submodules, which cannot be staged from the parent repo
- Incrementally updates `manifest.json` when `minecraftinstance.json` changes
- Generates `MODS.md` on demand via `@mctools/modlist`

The extension stays completely idle in workspaces that are not a modpack: the
**Mod Changes** view and the command palette entries only appear once a `mods/`
folder or a `minecraftinstance.json` is found.

## Commands

| Command | ID |
|---|---|
| Show Debug Log Errors | `mc-tools.showDebugLogPanel` |
| Show CraftTweaker Errors | `mc-tools.showCtErrors` |
| Refresh Mod Changes | `mc-tools.refreshModChanges` |
| Stage Selected Mod | `mc-tools.stageMod` |
| Stage All Mods | `mc-tools.stageAllMods` |
| Update MODS.md | `mc-tools.updateModsMd` |
| Update Manifest | `mc-tools.updateManifest` |

## Configuration

All settings live under the `mc-tools` namespace:

- `mc-tools.debugLog.enabled` — toggle the debug.log monitor
- `mc-tools.debugLog.path` — path to `debug.log`
- `mc-tools.debugLog.maxInitialReadBytes` — initial-read limit, from the start
- `mc-tools.debugLog.maxDiagnostics` — cap on entries in the Problems panel
- `mc-tools.crafttweakerLog.enabled` — toggle the CraftTweaker log monitor
- `mc-tools.crafttweakerLog.path` — path to `crafttweaker.log`
- `mc-tools.crafttweakerLog.maxDiagnostics` — cap on entries; errors are kept
  before warnings
- `mc-tools.modTracker.enabled` — toggle the Mod Changes view
- `mc-tools.manifest.autoUpdate` — auto-patch `manifest.json`
- `mc-tools.manifest.postfix` — manifest file postfix
- `mc-tools.curseforge.apiKey` — API key for `MODS.md` generation
- `mc-tools.logging.level` — output channel verbosity

## Development

```bash
# Install dependencies
pnpm install

# Build the bundle (entry point: dist/extension.mjs)
pnpm run build

# Regenerate assets/icon.png from the SVG motif
node scripts/build-icon.mjs

# Produce dist/mc-tools.vsix
pnpm run package
```

Press <kbd>F5</kbd> in this folder to launch an Extension Development Host with
the modpack repository already opened.

## Architecture

```
src/
├── extension.ts            # Host: activation, feature graph, context keys
├── watcher.ts              # Incremental log tailer
├── core/
│   ├── config.ts           # VSCode settings wrapper
│   ├── context.ts          # mc-tools:* context keys for `when` clauses
│   ├── logger.ts           # OutputChannel with timings
│   └── diagnostics.ts      # Unified DiagnosticCollection manager
├── features/
│   ├── debug-log/
│   │   ├── index.ts        # Module activate/deactivate
│   │   ├── engine.ts       # @mctools/errors adapter + dedupe
│   │   └── provider.ts     # Accumulating diagnostic provider
│   ├── crafttweaker-log/
│   │   ├── index.ts
│   │   ├── parsers/        # base, mixin (+MixinIndex), script, generic
│   │   └── provider.ts
│   └── mod-tracker/
│       ├── index.ts
│       ├── commands.ts     # Command registrations
│       ├── detector.ts     # Diff & fuzzy file→mod matching
│       ├── git.ts          # Staging via the vscode.git API
│       ├── git-api.ts      # Typings for the git extension
│       ├── manifest.ts     # manifest.json generation/patching
│       ├── modlist.ts      # MODS.md generation
│       ├── state.ts        # Cached instances + tree assembly
│       └── tree.ts         # TreeDataProvider
└── util/
    ├── gitmodules.ts       # .gitmodules parsing, submodule checks
    ├── helpers.ts          # Error text, severity, glob matching
    ├── logtail.ts          # Byte-range reads and newline counting
    └── normalize.ts        # Jar/config name normalisation
```
<!-- /persistent_desc -->

## Usage

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
