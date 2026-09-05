import type { JarFile } from '../src/server/mods.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { beforeAll, describe, expect, it } from 'vitest'
import { getConfig, ServerConfigSchema } from '../src/config.js'
import { buildExclusion, isExcluded, modPatternsOf } from '../src/server/exclude.js'
import { openServer } from '../src/server/index.js'
import { planModSync } from '../src/server/mods.js'
import { applyProperties, offlineUuid, serverPort } from '../src/server/provision.js'
import { expandStringList, readRef, readScalarRef } from '../src/server/refs.js'

/** A pack whose files are the ones a `server:` config would point at. */
let PACK: string

beforeAll(() => {
  PACK = mkdtempSync(join(tmpdir(), 'mctools-server-'))
  writeFileSync(join(PACK, 'relauncher.json'), JSON.stringify({
    selectedVersion: '0.6.11-alpha',
    javaPath       : 'C:/jdk/bin/javaw.exe',
  }))
  writeFileSync(join(PACK, 'setup.yaml'), [
    'install:',
    '  formatSpecific:',
    '    ignoreProject:',
    '      - 226406 # Custom Main Menu',
    '      - 238891 # Dynamic Surroundings',
    'launch:',
    '  javaArgs:',
    '    - -XX:+UseG1GC',
    '    - -Dfml.queryResult=confirm # auto confirm',
    '',
  ].join('\n'))
  writeFileSync(join(PACK, '.devonly.ignore'), [
    '# comment',
    'config/tellme',
    '!asm',
    'mods/OptiFine_*',
    'mods/ProbeZS-*',
    'shaderpacks/*',
    '',
  ].join('\n'))
  writeFileSync(join(PACK, 'server.properties'), 'motd=vanilla\nserver-port=25599\n')
})

describe('references', () => {
  it('reads a value out of JSON', async () => {
    expect(await readScalarRef(PACK, 'relauncher.json#selectedVersion')).toBe('0.6.11-alpha')
  })

  it('reads a list out of YAML, comments stripped by the parser', async () => {
    expect(await expandStringList(PACK, ['setup.yaml#launch.javaArgs'])).toEqual([
      '-XX:+UseG1GC',
      '-Dfml.queryResult=confirm',
    ])
  })

  it('keeps a literal that names no file, so args need no escaping', async () => {
    expect(await expandStringList(PACK, ['-Xmx4G', 'setup.yaml#launch.javaArgs'])).toEqual([
      '-Xmx4G',
      '-XX:+UseG1GC',
      '-Dfml.queryResult=confirm',
    ])
  })

  it('returns the spec itself when the path inside a real file misses', async () => {
    expect(await readRef(PACK, 'relauncher.json#nope.deeper')).toBeUndefined()
    expect(await readRef(PACK, 'no-such-file.json#x')).toBe('no-such-file.json#x')
  })
})

describe('exclusion', () => {
  it('keeps only mods/ patterns of a gitignore-style file', () => {
    expect(modPatternsOf(['# comment', 'config/tellme', '!asm', 'mods/OptiFine_*', 'shaderpacks/*']))
      .toEqual(['OptiFine_*'])
  })

  it('leaves a list that never mentions mods/ alone', () => {
    expect(modPatternsOf([226406, 'Custom Main Menu'])).toEqual([226406, 'Custom Main Menu'])
  })

  it('matches project ids, globs and plain names from the pack\'s own files', async () => {
    const ex = await buildExclusion(PACK, [
      'setup.yaml#install.formatSpecific.ignoreProject',
      '.devonly.ignore',
      'Custom Backgrounds',
    ])

    expect(isExcluded(ex, { fileName: 'CustomMainMenu-2.0.9.jar', addonID: 226406 })).toBe(true)
    expect(isExcluded(ex, { fileName: 'OptiFine_1.12.2_HD_U_G5.jar' })).toBe(true)
    expect(isExcluded(ex, { fileName: 'ProbeZS-1.18.10.jar' })).toBe(true)
    expect(isExcluded(ex, { fileName: 'custombackgrounds-1.1.4.jar', name: 'Custom Backgrounds' })).toBe(true)
    expect(isExcluded(ex, { fileName: 'ZenUtils-1.27.5.jar', addonID: 12345 })).toBe(false)
  })

  it('never matches a jar just because another entry of the same file did', async () => {
    const ex = await buildExclusion(PACK, ['.devonly.ignore'])
    expect(isExcluded(ex, { fileName: 'asm-9.jar' })).toBe(false)
    expect(isExcluded(ex, { fileName: 'tellme-0.9.jar' })).toBe(false)
  })
})

function jar(fileName: string, size = 10, mtimeMs = 1): JarFile {
  return {
    base    : fileName.replace(/(?:\.disabled)+$/, '').replace(/\.jar$/, ''),
    fileName,
    size,
    mtimeMs,
    disabled: !fileName.endsWith('.jar'),
  }
}

describe('mod sync plan', () => {
  const none = () => false

  it('mirrors the pack state when a jar is linked for the first time', () => {
    const plan = planModSync([jar('a.jar'), jar('b.jar.disabled')], [], none)
    expect(plan.link).toEqual([
      { base: 'a', from: 'a.jar', to: 'a.jar' },
      { base: 'b', from: 'b.jar.disabled', to: 'b.jar.disabled' },
    ])
  })

  it('leaves an unchanged link alone, whatever the two sides are called', () => {
    const plan = planModSync([jar('a.jar')], [jar('a.jar.disabled')], none)
    expect(plan).toMatchObject({ link: [], remove: [], kept: 1 })
  })

  it('relinks an updated jar under the name the server chose', () => {
    // The server disabled `a` for a bisect; the pack then shipped a new build.
    const plan = planModSync([jar('a.jar', 20, 2)], [jar('a.jar.disabled', 10, 1)], none)
    expect(plan.remove).toEqual(['a.jar.disabled'])
    expect(plan.link).toEqual([{ base: 'a', from: 'a.jar', to: 'a.jar.disabled' }])
  })

  it('drops a jar that became excluded and one the pack removed', () => {
    const plan = planModSync(
      [jar('client-only.jar'), jar('gone-from-pack.jar')],
      [jar('client-only.jar'), jar('stale.jar')],
      j => j.base === 'client-only'
    )
    expect(plan.excluded).toEqual(['client-only.jar'])
    expect(plan.remove.sort()).toEqual(['client-only.jar', 'stale.jar'])
    expect(plan.link).toEqual([{ base: 'gone-from-pack', from: 'gone-from-pack.jar', to: 'gone-from-pack.jar' }])
  })
})

describe('game dir seeding', () => {
  it('overrides the keys it is given and appends the ones the template lacks', () => {
    expect(applyProperties('motd=vanilla\nlevel-name=world\n', { 'motd': 'test', 'online-mode': 'false' }))
      .toBe('motd=test\nlevel-name=world\n\nonline-mode=false')
  })

  it('computes the offline-mode UUID the server will hand the player', () => {
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
  })

  it('reads the port off server.properties, falling back to the vanilla one', () => {
    expect(serverPort(PACK)).toBe(25599)
    expect(serverPort(join(PACK, 'nowhere'))).toBe(25565)
  })
})

describe('server target', () => {
  it('declares dedicated-server readiness instead of the pack\'s client signals', async () => {
    const config = await getConfig(PACK)
    config.ready = { logPattern: 'joined the game', tcpPort: 6489, quietMs: 8000, maxMs: 900_000 }
    config.server = ServerConfigSchema.parse({ dir: 'srv' })

    const target = await openServer({ packDir: PACK, config, provision: false, dry: false, reinstall: false })
    expect(target.gameDir.endsWith('srv')).toBe(true)
    expect(target.ready.logPattern).toMatch(/Done/)
    expect(target.ready.tcpPort).toBe(25565)
    expect(target.capabilities).toEqual([])
    expect(target.provisioned).toBeUndefined()
  })
})
