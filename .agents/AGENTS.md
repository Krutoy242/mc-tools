# MC-Tools

Automation tools for Minecraft modpack development by Krutoy242.

## Overview

Monorepo of specialized CLI tools and libraries for Minecraft modpack
development and maintenance. TypeScript, ESM-only, pnpm workspaces.

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
| `@mctools/reducer` | npm | Partially disable Minecraft mods (Ink TUI) |
| `@mctools/utils` | **never** | Shared utilities — bundled-only: `private`, inlined into consumers, never published |
| `@mctools/extension` | VS Code Marketplace (`vsce`) | "MC Tools: Modpack Dev Assistant" — `private` on npm |

## Scripts (`scripts/`)

- **ftbquests.ts** — FTB Quests automation utilities.
- **ftbq_cleanup.ts** — Convert quest-book texts to lang keys for translation.

## Tech stack

- **Runtime**: Node.js >= 24.0.0 · **Language**: TypeScript (ESM, strict)
- **Package manager**: pnpm (`pnpm-workspace.yaml`)
- **Build**: `unbuild` (Rollup); `@mctools/utils` uses `mkdist` (file-to-file)
- **Testing**: `vitest`
- **Lint/format**: ESLint flat config from `@mctools/eslint-plugin-zs/config`
  (`defineMctoolsConfig`) — the single source of truth shared with the
  Enigmatica2Expert-Extended modpack repo (one config, one style)
- **CI/CD**: GitHub Actions — `ci.yml` (build + test + lint on Ubuntu &
  Windows) and `release.yml` (`semantic-release` + `semantic-release-monorepo`)

## Conventions

- **`@mctools/utils` is bundled, not depended on.** Consumers keep it under
  `devDependencies` and inline it at build time via
  `rollup.inlineDependencies: [/@mctools\/utils/]`, so published tarballs are
  self-contained. Never add it to `dependencies`.
- **Publishing uses `pnpm publish`** (via `@semantic-release/exec`), not
  `npm publish`, because npm cannot resolve the `workspace:*` protocol.
- **Releases are commit-driven**: only `fix:`/`feat:` (Conventional Commits)
  bump versions; `build:`/`ci:`/`chore:` do not. Per-package git tags use the
  `@scope/name-vX.Y.Z` format.
- **Line endings are LF** (`.gitattributes`); tests assume LF fixtures.
