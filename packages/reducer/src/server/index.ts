import type { Capability, ReadyConfig, ReducerConfig } from '../config.js'
import type { Launcher } from '../launcher/types.js'
import type { MCInstance } from '../minecraftinstance.js'
import type { ModdedAddon } from '../Mod.js'
import type { ProvisionResult } from './provision.js'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'pathe'
import { findAddonByFilename } from '../ModStore.js'
import { ServerLauncher } from './launcher.js'
import { provisionServer, resolveJava, serverGameDir, serverPort, wantsConsole } from './provision.js'
import { expandStringList } from './refs.js'

export type { ProvisionResult } from './provision.js'

/**
 * "Done (12.345s)! For help, type" — printed by every dedicated server, vanilla
 * or modded, the moment it accepts players. Mod-agnostic by construction, which
 * is why the server target can declare readiness the pack never has to.
 */
const DEDICATED_READY = String.raw`Done \([^)]*\)! For help`

export interface ServerTarget {
  gameDir     : string
  launcher    : Launcher
  ready       : ReadyConfig
  capabilities: Capability[]
  /** What provisioning did, when it ran. */
  provisioned?: ProvisionResult
}

/** Filename → CurseForge addon, straight off the pack's instance manifest. */
async function addonIndex(packDir: string): Promise<(fileName: string) => ModdedAddon | undefined> {
  let addons: ModdedAddon[] = []
  try {
    const mci = JSON.parse(await readFile(join(packDir, 'minecraftinstance.json'), 'utf8')) as MCInstance
    addons = mci.installedAddons ?? []
  }
  catch { /* no manifest — exclusion then works by name/glob only */ }
  return fileName => findAddonByFilename(addons, fileName)
}

export interface OpenServerOptions {
  packDir  : string
  config   : ReducerConfig
  /** Create/refresh the game dir first. Off for read-only verbs (`ready`, `kill`). */
  provision: boolean
  dry      : boolean
  reinstall: boolean
}

/**
 * Resolve the dedicated server of a pack: where it runs, how it boots, and how
 * it says it is ready. Provisioning is folded in, because every verb that needs
 * the server's mod roster needs the roster to exist first.
 */
export async function openServer(opts: OpenServerOptions): Promise<ServerTarget> {
  const cfg = opts.config.server
  const gameDir = serverGameDir(opts.packDir, cfg)

  let provisioned: ProvisionResult | undefined
  if (opts.provision) {
    provisioned = await provisionServer({
      packDir  : opts.packDir,
      gameDir,
      cfg,
      addonOf  : await addonIndex(opts.packDir),
      dry      : opts.dry,
      reinstall: opts.reinstall,
    })
  }

  const launcher = new ServerLauncher({
    gameDir,
    java     : await resolveJava(opts.packDir, cfg),
    serverJar: provisioned?.serverJar ?? '',
    jvmArgs  : await expandStringList(opts.packDir, cfg.jvmArgs),
    minRam   : cfg.minRam,
    maxRam   : cfg.maxRam,
    console  : wantsConsole(cfg),
    title    : `${basename(opts.packDir)} server`,
  })

  return {
    gameDir,
    launcher,
    ready: {
      // The pack's own signals describe its *client* (a world-join line, a mod's
      // RMI port); a server that never joins a world would wait for them forever.
      logPattern: cfg.ready?.logPattern ?? DEDICATED_READY,
      tcpPort   : cfg.ready?.tcpPort ?? serverPort(gameDir),
      quietMs   : cfg.ready?.quietMs ?? opts.config.ready.quietMs,
      maxMs     : cfg.ready?.maxMs ?? opts.config.ready.maxMs,
    },
    capabilities: cfg.capabilities,
    provisioned,
  }
}
