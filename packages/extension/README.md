# MC Tools: Modpack Dev Assistant

VSCode extension for automating routine tasks in Minecraft 1.12.2 modpack development.

## Features

### Debug Log Monitor
- Incrementally parses `logs/debug.log` using `@mctools/errors`
- Shows errors and warnings as VSCode Diagnostics
- Handles large files (>50 MB) by reading the tail only
- Supports log truncation detection on Minecraft restart

### CraftTweaker Log Monitor
- Parses `logs/crafttweaker.log` with custom parsers:
  - **Mixin parser** — maps mixin fatal errors back to `.zs` source files
  - **Script parser** — resolves `__script__(file.zs:line)` stack traces
  - **Generic parser** — fallback for all `[FATAL|ERROR|WARNING]` lines
- Updates diagnostics when `.zs` files are saved

### Mod Tracker
- Detects mod changes by diffing `minecraftinstance.json` against git HEAD
- Groups changed `config/*` files by mod using fuzzy name matching
- Shows changes in a dedicated **Mod Changes** Explorer panel
- Supports staging files per-mod or all at once
- Incrementally updates `manifest.json` when `minecraftinstance.json` changes
- Generates `MODS.md` on demand via `@mctools/modlist`

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

- `mc-tools.debugLog.path` — path to `debug.log`
- `mc-tools.debugLog.maxInitialReadBytes` — tail read limit for large logs
- `mc-tools.debugLog.overlapBytes` — overlap window for incremental parsing
- `mc-tools.crafttweakerLog.path` — path to `crafttweaker.log`
- `mc-tools.manifest.autoUpdate` — auto-patch `manifest.json`
- `mc-tools.manifest.postfix` — manifest file postfix
- `mc-tools.curseforge.apiKey` — API key for `MODS.md` generation
- `mc-tools.logging.level` — output channel verbosity

## Development

```bash
# Install dependencies
pnpm install

# Build extension
pnpm run build

# The extension entry point is dist/extension.cjs
```

## Architecture

```
src/
├── extension.ts          # Entry point
├── core/
│   ├── config.ts         # VSCode settings wrapper
│   ├── logger.ts         # OutputChannel with timings
│   ├── watcher.ts        # Incremental file watcher
│   └── diagnostics.ts    # Unified DiagnosticCollection manager
├── debug-log/
│   ├── index.ts          # Module activate/deactivate
│   ├── reader.ts         # Incremental reader
│   ├── engine.ts         # @mctools/errors adapter
│   └── provider.ts       # Diagnostic provider
├── crafttweaker-log/
│   ├── index.ts
│   ├── parsers/          # Mixin, Script, Generic
│   ├── resolver.ts       # .zs file resolver
│   └── provider.ts
├── mod-tracker/
│   ├── index.ts
│   ├── detector.ts       # Diff & fuzzy matching
│   ├── manifest-sync.ts  # Incremental manifest update
│   ├── modlist-sync.ts   # MODS.md generation
│   ├── git-staging.ts    # Git integration
│   └── tree-provider.ts  # TreeDataProvider
└── utils/
    ├── file.ts
    ├── regex.ts
    └── throttle.ts
```
