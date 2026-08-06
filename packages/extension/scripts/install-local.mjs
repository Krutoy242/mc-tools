import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Keep in sync with the `--out` of the `package` script. */
const vsix = join(rootDir, 'dist', 'mc-tools.vsix')

/**
 * Editors shipping a VS Code-compatible CLI, tried in this order. `VSCODE_CLI`
 * overrides the list for a portable install or a fork that is not named here.
 */
const CANDIDATES = process.env.VSCODE_CLI
  ? [process.env.VSCODE_CLI]
  : ['code', 'code-insiders', 'codium', 'cursor', 'windsurf']

// The launchers are .cmd shims on Windows, which Node refuses to spawn
// directly. One command string rather than an argv array: `shell: true` with
// separate args is deprecated (DEP0190) precisely because it concatenates them
// anyway, so quoting is done here instead.
const quote = arg => arg.includes(' ') ? `"${arg}"` : arg
const run = (cmdline, opts) => spawnSync(cmdline, { shell: true, ...opts })

function findCli() {
  for (const cmd of CANDIDATES) {
    if (run(`${quote(cmd)} --version`, { stdio: 'ignore' }).status === 0) return cmd
  }
  return null
}

if (!existsSync(vsix)) {
  console.error(`[install] ${vsix} is missing — run \`pnpm run package\` first`)
  process.exit(1)
}

const cli = findCli()
if (!cli) {
  console.error(`[install] No VS Code CLI on PATH (tried: ${CANDIDATES.join(', ')})`)
  console.error('[install] Add one to PATH — on macOS via "Shell Command: Install \'code\' command in PATH" — or point VSCODE_CLI at it')
  process.exit(1)
}

// --force is not optional here: local builds reuse the same version, and
// without it the CLI sees that version installed and silently does nothing.
const { status } = run(`${quote(cli)} --install-extension "${vsix}" --force`, { stdio: 'inherit' })
if (status !== 0) process.exit(status ?? 1)

console.log(`\n[install] Installed with \`${cli}\` — run "Developer: Reload Window" to load it`)
