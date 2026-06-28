import type { JarMeta } from '../jarMeta.js'
import type { Mod } from '../Mod.js'
import type { WarningEntry } from '../ModStore.js'
import { humanSize } from './format.js'

/**
 * Non-interactive equivalents of the TUI panels. Each function returns the
 * compressed, one-or-few-line text that the interactive component would render
 * as a panel — so the CLI can print the same information without loading React.
 */

/** MOD ROSTER → a single line: enabled / disabled / total. */
export function summarizeRoster(mods: Mod[]): string {
  const enabled = mods.filter(m => m.enabled).length
  const disabled = mods.length - enabled
  return `ROSTER  enabled ${enabled} · disabled ${disabled} · total ${mods.length}`
}

/** DIAGNOSTICS → two labelled lines describing each problem class. */
export function summarizeDiagnostics(warnings: WarningEntry[]): string[] {
  const noAddon = warnings.filter(w => w.kind === 'noAddon').length
  const missing = warnings.filter(w => w.kind === 'noDependencies' || w.kind === 'missingDependency').length
  return [
    `Mods without CurseForge instance information (installed via 3rd-party sources): ${noAddon}`,
    `Mods with unresolved (missing) dependencies: ${missing}`,
  ]
}

/** WEIGHT METRICS → every metric the panel shows, as labelled lines. */
export function summarizeWeight(mods: Mod[], meta?: Map<string, JarMeta>): string[] {
  const size = (m: Mod) => m.addon?.installedFile.fileLength ?? 0
  const enabledSize = mods.filter(m => m.enabled).reduce((a, m) => a + size(m), 0)
  const disabledSize = mods.filter(m => m.disabled).reduce((a, m) => a + size(m), 0)
  const totalSize = enabledSize + disabledSize
  const heaviest = [...mods].sort((a, b) => size(b) - size(a))[0]
  const avgDepth = mods.length ? mods.reduce((a, m) => a + m.getDepsLevel(), 0) / mods.length : 0
  const maxDepth = mods.reduce((a, m) => Math.max(a, m.getDepsLevel()), 0)

  const lines = [
    `total size      ${humanSize(totalSize)} (enabled ${humanSize(enabledSize)} · disabled ${humanSize(disabledSize)})`,
    `heaviest mod    ${heaviest ? `${heaviest.displayName} (${humanSize(size(heaviest))})` : '—'}`,
    `dep depth       avg ${avgDepth.toFixed(2)} · max ${maxDepth}`,
  ]
  if (meta && meta.size) {
    let classes = 0
    for (const m of meta.values()) classes += m.classCount
    lines.push(`classes scanned ${classes.toLocaleString()} across ${meta.size}/${mods.length} jars`)
  }
  return lines
}
