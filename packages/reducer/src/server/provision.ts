import type { ServerConfig } from '../config.js'
import type { ModdedAddon } from '../Mod.js'
import type { SyncSummary } from './mods.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import process from 'node:process'
import consola from 'consola'
import { execa } from 'execa'
import { basename, join, resolve } from 'pathe'
import { buildExclusion } from './exclude.js'
import { linkDir, syncServerMods } from './mods.js'
import { readScalarRef } from './refs.js'

/**
 * @file Turn a client pack folder into a runnable dedicated-server game dir.
 *
 * The pack folder is a *client* instance: its `mods/` holds jars that kill a
 * dedicated server, and a running client keeps `logs/`, `config/` and the world
 * busy. So the server gets a game directory of its own, filled with junctions
 * back into the pack (`config`, `scripts`, ...) and hardlinks to every
 * server-safe jar — nothing is stored twice, and editing a script or a config
 * in the pack is what the server loads on its next boot.
 *
 * Provisioning is idempotent: everything the server writes is created once and
 * then left alone, so hand edits inside the game dir survive.
 */

/** Java the pack itself runs on, so client and server share one runtime. */
export async function resolveJava(packDir: string, cfg: ServerConfig): Promise<string> {
  const configured = await readScalarRef(packDir, cfg.java)
  // A `javaw` path is the same JDK without a console — the server wants the console one.
  const java = configured?.replace(/javaw(\.exe)?$/i, 'java$1')
  if (java && existsSync(java)) return java
  if (cfg.java) consola.warn(`server.java: "${cfg.java}" resolved to ${java ?? 'nothing'} — falling back to \`java\` from PATH.`)
  return 'java'
}

/** `jar` from the same JDK — used only when `install.selfClassPath` is on. */
function jarBinary(java: string): string {
  const jar = java.replace(/java(\.exe)?$/i, 'jar$1')
  if (jar !== java && existsSync(jar)) return jar
  throw new Error(`server.install.selfClassPath needs the JDK "jar" tool next to ${java} (looked for ${jar}).`)
}

/** No manifest line may exceed 72 bytes; the rest continues after a single space. */
export function wrapManifest(attribute: string): string {
  const lines = [attribute.slice(0, 72)]
  for (let rest = attribute.slice(72); rest; rest = rest.slice(71)) lines.push(` ${rest.slice(0, 71)}`)
  return lines.join('\r\n')
}

/** `Class-Path:` of a manifest, continuation lines folded back together. */
export function manifestClassPath(manifest: string): string[] {
  const lines = manifest.split(/\r?\n/)
  const first = lines.findIndex(line => line.startsWith('Class-Path: '))
  if (first === -1) return []

  let value = lines[first].slice('Class-Path: '.length)
  for (let i = first + 1; i < lines.length && lines[i].startsWith(' '); i++) value += lines[i].slice(1)
  return value.split(' ').filter(Boolean)
}

/**
 * Put the launch jar into its own manifest `Class-Path`.
 *
 * A coremod that compiles scripts before the game starts (ZenUtils and its
 * mixin scripts) reads the classes those scripts may reference off the manifest
 * `Class-Path` of the jar `java.class.path` names. That list has the libraries
 * and `minecraft_server.jar` but not the launch jar itself — where every
 * `net.minecraftforge.*` class lives. Each Forge type a script touches then
 * falls through to `Class.forName`, is loaded half-transformed in the coremod
 * phase, and the server dies at vanilla bootstrap with `NoSuchMethodError:
 * IForgeRegistryEntry.getRegistryName()`.
 *
 * Naming the jar in its own `Class-Path` fixes that and changes nothing else:
 * the JVM already had it on the classpath, and `java -jar <loader>.jar` stays
 * the command — which matters, because FML reads the first entry of
 * `java.class.path` as *the* Minecraft jar and scans it for `@CapabilityInject`.
 *
 * @link https://github.com/friendlyhj/ZenUtils/issues/148
 */
export async function patchLoaderManifest(serverJar: string, java: string): Promise<boolean> {
  const jar = jarBinary(java)
  const work = mkdtempSync(join(tmpdir(), 'mctools-loader-'))
  try {
    await execa(jar, ['xf', serverJar, 'META-INF/MANIFEST.MF'], { cwd: work })
    const entries = manifestClassPath(readFileSync(join(work, 'META-INF', 'MANIFEST.MF'), 'utf8'))
    const self = basename(serverJar)
    if (entries.includes(self)) return false

    const patch = join(work, 'patch.mf')
    writeFileSync(patch, `${wrapManifest(`Class-Path: ${[self, ...entries].join(' ')}`)}\r\n\r\n`)
    await execa(jar, ['--update', `--file=${serverJar}`, `--manifest=${patch}`], { cwd: work })
    return true
  }
  finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Download and run the loader installer, once. Returns the jar to boot. */
async function installLoader(packDir: string, gameDir: string, cfg: ServerConfig, version: string): Promise<string | undefined> {
  const jarName = cfg.jar?.replaceAll('{version}', version)
  const serverJar = jarName ? join(gameDir, jarName) : undefined
  if (!cfg.install?.installer) return serverJar
  if (serverJar && existsSync(serverJar)) return serverJar

  const url = cfg.install.installer.replaceAll('{version}', version)
  const installer = join(gameDir, basename(new URL(url).pathname))
  if (!existsSync(installer)) {
    consola.start(`downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
    writeFileSync(installer, Buffer.from(await response.arrayBuffer()))
  }

  consola.start(`installing the server loader into ${gameDir} (pulls the loader libraries, ~200 MB)`)
  const { exitCode } = await execa(await resolveJava(packDir, cfg), ['-jar', basename(installer), ...cfg.install.args], {
    cwd   : gameDir,
    stdio : 'inherit',
    reject: false,
  })
  if (exitCode !== 0) throw new Error(`the loader installer exited with code ${exitCode} — see ${gameDir}/*installer*.log`)
  if (serverJar && !existsSync(serverJar)) {
    throw new Error(`the installer produced no ${basename(serverJar)} — check "server.jar" in reducer.config.yml`)
  }
  consola.success(`server loader ${version} installed.`)
  return serverJar
}

/** Offline-mode UUID Minecraft gives a player when `online-mode=false`. */
export function offlineUuid(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  md5[6] = (md5[6] & 0x0F) | 0x30 // version 3
  md5[8] = (md5[8] & 0x3F) | 0x80 // IETF variant
  const hex = md5.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The player this pack has actually been played by — the one to op. */
function packPlayerName(packDir: string): string | undefined {
  try {
    const cache = JSON.parse(readFileSync(join(packDir, 'usernamecache.json'), 'utf8')) as Record<string, string>
    return Object.values(cache)[0]
  }
  catch {
    return undefined
  }
}

function writeIfMissing(file: string, contents: string): boolean {
  if (existsSync(file)) return false
  writeFileSync(file, contents)
  return true
}

/** Apply `server.properties` overrides to a template, key by key. */
export function applyProperties(template: string, overrides: Record<string, string>): string {
  const seen = new Set<string>()
  const lines = template.split(/\r?\n/).map((line) => {
    const key = line.split('=')[0]
    if (!(key in overrides)) return line
    seen.add(key)
    return `${key}=${overrides[key]}`
  })
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`)
  }
  return lines.join('\n')
}

/** Everything the server writes itself, created once so hand edits survive. */
function seedGameDir(packDir: string, gameDir: string, cfg: ServerConfig): void {
  for (const dir of cfg.link) linkDir(join(packDir, dir), join(gameDir, dir))
  for (const dir of cfg.seed) {
    if (existsSync(join(packDir, dir)) && !existsSync(join(gameDir, dir)))
      cpSync(join(packDir, dir), join(gameDir, dir), { recursive: true })
  }

  if (cfg.eula && writeIfMissing(join(gameDir, 'eula.txt'), 'eula=true\n'))
    consola.info('wrote eula.txt — Mojang EULA accepted on your behalf.')

  if (!existsSync(join(gameDir, 'server.properties'))) {
    const template = cfg.propertiesFrom && existsSync(join(packDir, cfg.propertiesFrom))
      ? readFileSync(join(packDir, cfg.propertiesFrom), 'utf8')
      : ''
    const props = applyProperties(template, cfg.properties)
    if (props.trim()) {
      writeFileSync(join(gameDir, 'server.properties'), props)
      consola.info('wrote server.properties.')
    }
  }

  const player = cfg.op ?? packPlayerName(packDir)
  if (player && writeIfMissing(join(gameDir, 'ops.json'), `${JSON.stringify([{
    uuid               : offlineUuid(player),
    name               : player,
    level              : 4,
    bypassesPlayerLimit: false,
  }], null, 2)}\n`)) {
    consola.info(`opped ${player} (offline-mode UUID).`)
  }
}

export interface ProvisionResult {
  gameDir  : string
  /** Jar to `java -jar`, when the pack configured one. */
  serverJar: string | undefined
  version  : string | undefined
  mods     : SyncSummary
}

export interface ProvisionOptions {
  packDir   : string
  gameDir   : string
  cfg       : ServerConfig
  /** Addon of a pack jar, so exclusion by CurseForge project id works. */
  addonOf   : (fileName: string) => ModdedAddon | undefined
  dry       : boolean
  /** Re-run the loader installer even if its jar is already there. */
  reinstall?: boolean
}

/** Create (or refresh) the server game dir. Safe to run before every boot. */
export async function provisionServer(opts: ProvisionOptions): Promise<ProvisionResult> {
  const { packDir, gameDir, cfg, dry } = opts
  const version = await readScalarRef(packDir, cfg.install?.version)

  if (cfg.install?.version && !version) {
    throw new Error(`server.install.version: "${cfg.install.version}" resolved to nothing — the server would install a loader the client does not run.`)
  }

  const named = (template: string | undefined) => template?.replaceAll('{version}', version ?? '')
  let serverJar = named(cfg.jar) ? join(gameDir, named(cfg.jar)!) : undefined

  if (!dry) {
    mkdirSync(gameDir, { recursive: true })
    if (opts.reinstall && serverJar) rmSync(serverJar, { force: true })
    serverJar = await installLoader(packDir, gameDir, cfg, version ?? '') ?? serverJar
    if (serverJar && cfg.install?.selfClassPath && existsSync(serverJar)) {
      const patched = await patchLoaderManifest(serverJar, await resolveJava(packDir, cfg))
      if (patched) consola.info(`listed ${basename(serverJar)} in its own manifest Class-Path, so coremods find the Forge classes.`)
    }
    seedGameDir(packDir, gameDir, cfg)
  }

  const excluded = await buildExclusion(packDir, cfg.exclude)
  const mods = await syncServerMods(packDir, gameDir, excluded, opts.addonOf, dry)

  return { gameDir, serverJar, version, mods }
}

/** Absolute game dir of the server built from this pack. */
export function serverGameDir(packDir: string, cfg: ServerConfig): string {
  return resolve(packDir, cfg.dir)
}

/** Port the server listens on, read from the game dir's `server.properties`. */
export function serverPort(gameDir: string): number {
  try {
    const props = readFileSync(join(gameDir, 'server.properties'), 'utf8')
    const port = Number(props.match(/^server-port\s*=\s*(\d+)/m)?.[1])
    if (Number.isInteger(port) && port > 0) return port
  }
  catch { /* not provisioned yet */ }
  return 25565
}

/** Whether a console window is wanted here (Windows has one to give). */
export function wantsConsole(cfg: ServerConfig): boolean {
  return cfg.console ?? process.platform === 'win32'
}
