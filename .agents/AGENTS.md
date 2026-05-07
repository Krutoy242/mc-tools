# MC-Tools

Automation tools for Minecraft modpack development by Krutoy242.

## Overview

Monorepo containing specialized CLI tools and libraries for Minecraft modpack development and maintenance. Built with TypeScript, uses pnpm workspaces.

## Packages

| Package | Description |
|---------|-------------|
| `@mctools/curseforge` | Lib for working with CurseForge using `minecraftinstance.json` |
| `@mctools/errors` | Scan `debug.log` file to find unknown errors |
| `@mctools/modlist` | Generate `.md` file with all mods listed |
| `@mctools/format` (private) | Format `.zs` (ZenScript) files using ESLint |
| `@mctools/eslint-plugin-zs` (private) | ESLint plugin: lint/auto-format `.zs` via `@mctools/format` (no second ESLint instance) |
| `@mctools/manifest` (private) | `manifest.json` generation tool |
| `@mctools/reducer` (private) | Partially disable Minecraft mods |
| `@mctools/tcon` (private) | Tweaks Tinker Construct's materials with CSV tables |
| `@mctools/utils` (private) | Shared utilities for the monorepo |

## Scripts

- **ftbquests.ts** - FTB Quests automation utilities
- **ftbq_cleanup.ts** - Cleanup lang entries in quest book for translation

## Tech Stack

- **Runtime**: Node.js >= 24.0.0
- **Language**: TypeScript
- **Package Manager**: pnpm
- **Build**: unbuild
- **Testing**: vitest
- **Release**: semantic-release (monorepo)
