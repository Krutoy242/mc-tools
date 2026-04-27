<h1 align="center">@mctools/format</h1>

Format .zs files by using ESLint for typescript

<!-- extended_desc -->
The pipeline is:

```
.zs ──Peggy──▶ .ts (with markers) ──ESLint --fix──▶ .ts ──regex revert──▶ .zs
```

The Peggy grammar (`src/zenscript.peggy`) lexes ZenScript and emits valid TypeScript sprinkled with block-comment markers. ESLint formats it like any other TS file, then a disciplined set of regexes (see `src/tsToZs.ts`) maps the markers back to ZS.

**Requirements:**
* `eslint@^9` is a **peer dependency** — install it in the host project alongside whatever ESLint config you want applied to the intermediate `.ts` files (e.g. `@antfu/eslint-config`). The package intentionally provides no config of its own; the whole point is to reuse yours.

**Programmatic API:**

```ts
import { revert, zsToTs } from '@mctools/format'

const result = zsToTs(zsSource)            // pure: string → { ok, ts } | { ok: false, error }
if (result.ok) {
  // result.ts contains marker-laden TypeScript
  const back = revert(/* TS source after ESLint */)
}
```

`zsToTs` / `revert` are pure (string in → string out). For batch file I/O see `convertToTs` from `@mctools/format/dist/formatFile`.
<!-- /extended_desc -->

## Usage

1. Install latest NodeJS for [Windows](https://nodejs.org/en/download/current/) or [Unix](https://nodejs.org/en/download/package-manager/)

2. Open console, navigate to your Minecraft directory (one with the mods/ directory or options.txt file)
    ```sh
    > cd C:/Instances/MyModpack
    ```

3. Run:
    ```sh
    > npx @mctools/format --help
    ```

### Options

```shell
Format .zs files by using ESLint for typescript (@mctools/format v0.0.0)

USAGE @mctools/format [OPTIONS] <FILES>

ARGUMENTS

  FILES    Path to file / files for formatting    

OPTIONS

  -i, --ignore    Same as --ignore-pattern for ESLint
   -p, --pause    Pause and ask before linting
```

## Author

* https://github.com/Krutoy242

## Other tools

* [@mctools/errors](https://github.com/Krutoy242/mc-tools/tree/master/packages/errors) - Scan debug.log file to find unknown errors
* [@mctools/modlist](https://github.com/Krutoy242/mc-tools/tree/master/packages/modlist) - Generate .md file with all mods listed
