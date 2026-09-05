import type { Capability, ReadyConfig, ReducerConfig } from '../config.js'
import type { Launcher } from '../launcher/types.js'
import type { ProvisionResult } from '../server/index.js'
import { getConfig } from '../config.js'
import { resolveLauncher } from '../launcher/index.js'
import { openServer } from '../server/index.js'

/**
 * @file What a command is pointed at: the pack's client, or its server.
 *
 * One pack folder describes two games. The client is the folder itself; the
 * dedicated server is a game dir built out of it, with its own `mods/`, logs
 * and crash reports — which is the whole point, since the two mod sets must be
 * able to differ (a reduced server next to a full client) and neither may
 * disturb the other's files while it runs.
 *
 * Everything downstream — the mod roster, the session lock, the log monitor,
 * the binary search — is addressed by *game dir*, so switching target switches
 * all of it at once and no command needs a server branch of its own.
 */
export interface Target {
  /** Game dir: `mods/`, `logs/`, `crash-reports/`, and the session-lock key. */
  gameDir     : string
  /** Pack dir: `reducer.config.yml` and `minecraftinstance.json`. */
  packDir     : string
  isServer    : boolean
  config      : ReducerConfig
  launcher    : Launcher
  /** Readiness signals for *this* game — a server's differ from a client's. */
  ready       : ReadyConfig
  /** Capability warnings that apply to this game. */
  capabilities: Capability[]
  /** What provisioning did, when this command ran it. */
  provisioned?: ProvisionResult
}

export interface TargetInput {
  mcPath    : string
  /** Drive the pack's dedicated server instead of its client. */
  server?   : boolean
  /** The command needs the game dir to exist (roster, launch). */
  provision?: boolean
  dry?      : boolean
  /** Re-run the loader installer (after a loader bump). */
  reinstall?: boolean
}

export async function openTarget(input: TargetInput): Promise<Target> {
  const packDir = input.mcPath
  const config = await getConfig(packDir)

  if (!input.server) {
    return {
      gameDir     : packDir,
      packDir,
      isServer    : false,
      config,
      launcher    : resolveLauncher(packDir, config.launcher),
      ready       : config.ready,
      capabilities: config.capabilities,
    }
  }

  const server = await openServer({
    packDir,
    config,
    provision: Boolean(input.provision),
    dry      : Boolean(input.dry),
    reinstall: Boolean(input.reinstall),
  })

  return {
    gameDir     : server.gameDir,
    packDir,
    isServer    : true,
    config,
    launcher    : server.launcher,
    ready       : server.ready,
    capabilities: server.capabilities,
    provisioned : server.provisioned,
  }
}

/** One line describing what provisioning left in the server dir. */
export function summarizeProvision(result: ProvisionResult): string {
  const { mods } = result
  const parts = [
    `enabled ${mods.enabled}/${mods.total}`,
    `${mods.excluded.length} excluded`,
  ]
  if (mods.link.length) parts.push(`${mods.link.length} linked`)
  if (mods.remove.length) parts.push(`${mods.remove.length} removed`)
  return `SERVER  ${result.gameDir}${result.version ? ` · ${result.version}` : ''} · mods ${parts.join(' · ')}`
}
