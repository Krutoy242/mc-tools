import { beforeEach, describe, expect, it } from 'vitest'

import { DiagnosticsManager } from '../src/core/diagnostics.js'
import { parseHeader } from '../src/features/crafttweaker-log/entry.js'
import { genericParser } from '../src/features/crafttweaker-log/parsers/generic.js'
import { scriptParser } from '../src/features/crafttweaker-log/parsers/script.js'
import { CraftTweakerDiagnosticsProvider } from '../src/features/crafttweaker-log/provider.js'
import { scanLog } from '../src/features/crafttweaker-log/scan.js'
import { recorder, resetRecorder } from './stubs/vscode.js'

const ROOT = '/pack'
const PARSERS = [scriptParser, genericParser]

const silentLogger = {
  debug: () => {},
  info : () => {},
  warn : () => {},
  error: () => {},
  time : () => () => {},
}

/** The failure the pack reports when a Tinkers modifier clashes, verbatim. */
const TINKER_FATAL = [
  '[SERVER_STARTED][SERVER][INFO] ~~opened container: thaumcraft.common.container.ContainerPech@5667bc0e',
  '[SERVER_STARTED][SERVER][FATAL] Modifier Blasting cannot be combined with enchantment Silk Touch',
  'slimeknights.tconstruct.library.modifiers.TinkerGuiException: Modifier Blasting cannot be combined with enchantment Silk Touch',
  '\tat slimeknights.tconstruct.library.modifiers.Modifier.canApplyWithEnchantment(Modifier.java:113)',
  '\tat slimeknights.tconstruct.library.modifiers.Modifier.canApply(Modifier.java:96)',
  '\tat equipment\\ModifierGenVRVtZVF.buildSlotPool(equipment\\modifierGen.zs:128)',
  '\tat equipment\\ModifierGenVRVtZVF.applicablePool(equipment\\modifierGen.zs:138)',
  '\tat equipment\\EquipGenerationVRVtZVF.onSpawnEvent(equipment\\equipGeneration.zs:238)',
  '\tat CrafttweakerReloadableVRVtZVFequipment\\EquipGenerationVRVtZVF0.handle(equipment\\equipGeneration.zs)',
  '\tat crafttweaker.util.EventList.publish(MixinEventList.java:51)',
].join('\n')

describe('parseHeader', () => {
  it('splits scopes from the level', () => {
    expect(parseHeader('[SERVER_STARTED][SERVER][FATAL] boom')).toEqual({
      scopes : ['SERVER_STARTED', 'SERVER'],
      level  : 'FATAL',
      message: 'boom',
    })
  })

  it('drops the colon that separates brackets from the message', () => {
    expect(parseHeader('[ERROR] [FML]: something bad')?.message).toBe('something bad')
  })

  it('ignores a line that does not open with a bracket', () => {
    expect(parseHeader('just a normal line')).toBeUndefined()
  })
})

describe('scanLog', () => {
  it('points a Java stack trace at the .zs line that caused it', () => {
    const { errors } = scanLog(TINKER_FATAL, ROOT, PARSERS)

    expect(errors).toHaveLength(1)
    const [e] = errors
    expect(e.targetUri?.fsPath).toBe('/pack/scripts/equipment/modifierGen.zs')
    expect(e.targetLine).toBe(127)
    expect(e.originLine).toBe(1)
    expect(e.scope).toBe('SERVER_STARTED/SERVER')
    expect(e.message).toBe('⟦TinkerGuiException⟧ Modifier Blasting cannot be combined with enchantment Silk Touch')
  })

  it('keeps the outer .zs frames as related call sites, skipping Java ones', () => {
    const [e] = scanLog(TINKER_FATAL, ROOT, PARSERS).errors

    expect(e.related?.map(f => `${f.uri.fsPath}:${f.line} ${f.label}`)).toEqual([
      '/pack/scripts/equipment/modifierGen.zs:137 applicablePool()',
      '/pack/scripts/equipment/equipGeneration.zs:237 onSpawnEvent()',
    ])
  })

  it('never reports a stack trace as an entry of its own', () => {
    // Every `at …` line used to be re-offered to the parsers, so a trace that
    // happened to mention a level would surface as a second finding.
    const { errors } = scanLog(`${TINKER_FATAL}\n[SERVER_STARTED][SERVER][INFO] done`, ROOT, PARSERS)
    expect(errors).toHaveLength(1)
  })

  it('reads a location written into the message itself', () => {
    const { errors } = scanLog(
      '[SERVER_STARTED][CLIENT][ERROR] _init\\purge.zs:297: Could not resolve <jaopca:item_dusttiny>',
      ROOT,
      PARSERS
    )

    expect(errors[0].targetUri?.fsPath).toBe('/pack/scripts/_init/purge.zs')
    expect(errors[0].targetLine).toBe(296)
    expect(errors[0].message).toBe('Could not resolve <jaopca:item_dusttiny>')
  })

  it('takes the text after the arrow of a `scripts/x.zs:12 > msg` entry', () => {
    const { errors } = scanLog('[INITIALIZATION][CLIENT][ERROR] Error executing scripts/foo.zs:12 > bad syntax', ROOT, PARSERS)

    expect(errors[0].targetUri?.fsPath).toBe('/pack/scripts/foo.zs')
    expect(errors[0].targetLine).toBe(11)
    expect(errors[0].message).toBe('bad syntax')
  })

  it('falls back to the log entry when nothing names a script', () => {
    const { errors } = scanLog('[ERROR] [FML]: something bad', ROOT, PARSERS)

    expect(errors[0].targetUri).toBeUndefined()
    expect(errors[0].message).toBe('something bad')
    expect(errors[0].severity).toBe('error')
  })

  it('maps WARNING to a warning and leaves INFO alone', () => {
    const { errors } = scanLog('[WARNING]: heads up\n[INFO]: nothing to see', ROOT, PARSERS)

    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('warning')
  })

  it('leaves no trailing whitespace on a CRLF log', () => {
    // A `\r` left on the message renders as a second, empty row in Problems.
    const { errors } = scanLog('[ERROR] [FML]: something bad\r\n[INFO]: quiet\r\n', ROOT, PARSERS)

    expect(errors[0].message).toBe('something bad')
  })
})

describe('craftTweakerDiagnosticsProvider', () => {
  beforeEach(() => {
    resetRecorder()
  })

  const provider = () => new CraftTweakerDiagnosticsProvider(
    new DiagnosticsManager(),
    silentLogger,
    ROOT,
    'crafttweaker.log',
    500
  )

  it('collapses a failure that repeats for every event that trips it', () => {
    // The Tinkers clash is logged once per mob spawn — hundreds of identical
    // rows on one script line.
    const { errors } = scanLog([TINKER_FATAL, TINKER_FATAL, TINKER_FATAL].join('\n'), ROOT, PARSERS)
    expect(errors).toHaveLength(3)

    provider().update(errors)

    const [[uri, list]] = recorder.diagnostics
    expect(uri.fsPath).toBe('/pack/scripts/equipment/modifierGen.zs')
    expect(list).toHaveLength(1)
    expect(list[0].message.endsWith('(×3)')).toBe(true)
  })

  it('links a retargeted finding back to the log line it came from', () => {
    const { errors } = scanLog(TINKER_FATAL, ROOT, PARSERS)
    provider().update(errors)

    const [d] = recorder.diagnostics[0][1]
    const code = d.code as { value: string, target: { toString: () => string } }
    expect(code.value).toBe('crafttweaker.log:2')
    expect(code.target.toString()).toBe('file:///pack/crafttweaker.log#L2')
    expect(d.source).toBe('SERVER_STARTED/SERVER')
    expect(d.relatedInformation).toHaveLength(2)
  })

  it('leaves findings that stayed on the log without a self-link', () => {
    const { errors } = scanLog('[ERROR] [FML]: something bad', ROOT, PARSERS)
    provider().update(errors)

    const [[uri, list]] = recorder.diagnostics
    expect(uri.fsPath).toBe('/pack/crafttweaker.log')
    expect(list[0].code).toBeUndefined()
  })
})
