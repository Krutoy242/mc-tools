import type { JarMetaLoader } from '../../jarMeta.js'
import type { Mod } from '../../Mod.js'
import type { WarningEntry } from '../../ModStore.js'
import type { GlyphCell } from '../layout/GlyphGrid.js'
import { Box, Text, useInput } from 'ink'
import Gradient from 'ink-gradient'
import React, { useEffect, useMemo, useState } from 'react'
import { humanSize } from '../components/SizeBar.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Gauge } from '../layout/Gauge.js'
import { GlyphGrid } from '../layout/GlyphGrid.js'
import { Panel } from '../layout/Panel.js'
import { StatusChip } from '../layout/StatusChip.js'
import { useTheme } from '../ThemeContext.js'

export type WelcomeChoice = 'manual' | 'binary' | 'fixDeps' | 'quit'

interface WelcomeProps {
  modpackName: string
  mods       : Mod[]
  warnings   : WarningEntry[]
  loader?    : JarMetaLoader
  onChoose   : (c: WelcomeChoice) => void
}

const SIZE_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return `${str.slice(0, maxLen - 1)}…`
}

export function Welcome({ modpackName, mods, warnings, loader, onChoose }: WelcomeProps) {
  const t = useTheme()
  const { breakpoint, columns } = useTerminalSize()
  const [focus, setFocus] = useState<0 | 1 | 2>(0)

  const fixDepsAvailable = warnings.some(w =>
    w.kind === 'noDependencies' || w.kind === 'missingDependency' || w.kind === 'noAddon')

  const buttons: WelcomeChoice[] = ['manual', 'binary', ...fixDepsAvailable ? ['fixDeps' as const] : []]

  // Item 11 — re-render every ~700 ms so the cache footer reflects the
  // background scan progress without a manual refresh. The scan runs in
  // JarMetaLoader; we just read its peekAll() size.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 700)
    return () => clearInterval(id)
  }, [])
  const cachedCount = loader?.peekAll().size ?? 0

  useInput((input, key) => {
    if (key.leftArrow || (key.tab && key.shift))
      setFocus(f => ((f - 1 + buttons.length) % buttons.length) as 0 | 1 | 2)
    else if (key.rightArrow || key.tab)
      setFocus(f => ((f + 1) % buttons.length) as 0 | 1 | 2)
    else if (key.return) onChoose(buttons[focus] ?? 'quit')
    else if (input === 'q' || key.escape) onChoose('quit')
    else if (input === '1') onChoose('manual')
    else if (input === '2') onChoose('binary')
    else if (input === '3' && fixDepsAvailable) onChoose('fixDeps')
  })

  const stats = useMemo(() => {
    const enabled = mods.filter(m => m.enabled).length
    const disabled = mods.length - enabled
    const enabledSize = mods
      .filter(m => m.enabled)
      .map(m => m.addon?.installedFile.fileLength ?? 0)
      .reduce((a, b) => a + b, 0)
    const disabledSize = mods
      .filter(m => m.disabled)
      .map(m => m.addon?.installedFile.fileLength ?? 0)
      .reduce((a, b) => a + b, 0)
    const totalSize = enabledSize + disabledSize
    const heaviest = [...mods]
      .map(m => ({ mod: m, size: m.addon?.installedFile.fileLength ?? 0 }))
      .sort((a, b) => b.size - a.size)[0]
    const avgDepth = mods.length > 0
      ? mods.reduce((a, m) => a + m.getDepsLevel(), 0) / mods.length
      : 0
    const maxDepth = mods.reduce((a, m) => Math.max(a, m.getDepsLevel()), 0)
    const noAddon = warnings.filter(w => w.kind === 'noAddon').length
    const missing = warnings.filter(w => w.kind === 'noDependencies' || w.kind === 'missingDependency').length
    return { enabled, disabled, totalSize, enabledSize, disabledSize, heaviest, avgDepth, maxDepth, noAddon, missing }
  }, [mods, warnings])

  // Item 13 surfaces classes via loader.peekAll() once background scan completes.
  const totalClasses = useMemo(() => {
    if (!loader) return 0
    let sum = 0
    for (const m of loader.peekAll().values()) sum += m.classCount
    return sum
  }, [loader, mods])

  const maxModSize = stats.heaviest?.size ?? 1

  // Build per-mod cells: color reflects dep depth (root/library → splitA;
  // top-level → primary), glyph reflects size (small ▁ → big █).
  const gridWidth = breakpoint === 'sm' ? 24 : breakpoint === 'md' ? 40 : 60
  const cells: GlyphCell[] = useMemo(() => {
    const palette = [t.splitA, t.splitB, t.primary, t.accent]
    return mods.slice(0, gridWidth * 6).map((m) => {
      const size = m.addon?.installedFile.fileLength ?? 0
      // Log scale so a single 50 MB mod doesn't squash everything else to ▁.
      // log2(size+1)/log2(max+1) gives a useful spread across small mods too.
      const norm = maxModSize > 0 && size > 0
        ? Math.log2(size + 1) / Math.log2(maxModSize + 1)
        : 0
      const sizeIdx = Math.max(0, Math.min(
        SIZE_BLOCKS.length - 1,
        Math.floor(norm * SIZE_BLOCKS.length)
      ))
      const glyph = m.disabled ? '·' : SIZE_BLOCKS[sizeIdx]

      const w = warningsByMod(warnings)
      const wKind = w.get(m)
      let color: string
      if (m.disabled) {
        color = t.fgMuted
      }
      else if (wKind === 'noAddon') {
        color = t.warning
      }
      else if (wKind === 'noDependencies' || wKind === 'missingDependency') {
        color = t.danger
      }
      else {
        const depth = m.getDepsLevel()
        const norm = stats.maxDepth > 0 ? depth / stats.maxDepth : 0
        color = palette[Math.min(palette.length - 1, Math.floor(norm * palette.length))]
      }
      return { glyph, color }
    })
  }, [mods, gridWidth, maxModSize, warnings, stats.maxDepth, t])

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Gradient colors={[t.primary, t.accent]}>
          <Text bold>
            {`◢  ${modpackName}  ◣`}
          </Text>
        </Gradient>
        <Text color={t.fgMuted}>
          {columns}
          c · reducer control surface
        </Text>
      </Box>

      <Box marginTop={1} flexDirection={breakpoint === 'sm' ? 'column' : 'row'}>
        <Panel title="◆ MOD ROSTER" variant="strong" flexGrow={1}>
          <GlyphGrid cells={cells} width={gridWidth} />
          <Box marginTop={1}>
            <StatusChip label="enabled"  count={stats.enabled}  variant="success" />
            <StatusChip label="disabled" count={stats.disabled} variant="info" />
            <StatusChip label="total"    count={mods.length}    variant="accent" />
          </Box>
          <Box marginTop={0}>
            <Text color={t.fgMuted}>color = dep depth · glyph height = file size</Text>
          </Box>
        </Panel>

        <Box flexDirection="column" marginLeft={breakpoint === 'sm' ? 0 : 1} flexGrow={1}>
          <Panel title="▮ DIAGNOSTICS">
            <Box flexDirection="row">
              <StatusChip label="no-addon"    count={stats.noAddon} variant={stats.noAddon ? 'warning' : 'success'} />
              <StatusChip label="missing-dep" count={stats.missing} variant={stats.missing ? 'danger' : 'success'} />
            </Box>
            {fixDepsAvailable
              ? <Text color={t.fgMuted}>press 3 or pick "Fix Deps" to inspect & resolve</Text>
              : <Text color={t.fgMuted}>all dependencies look healthy</Text>}
          </Panel>

          <Box marginTop={1}>
            <Panel title="▰ WEIGHT METRICS">
              {(() => {
                // Side-by-side panels (md/lg) leave too little room for
                // horizontal 28-cell bars + trails, so we go compact there
                // as well. In compact mode we also truncate trails so an
                // unexpectedly long mod name never wraps.
                const compact = breakpoint !== 'lg'
                const maxTrail = Math.max(20, columns - 10)
                const gauges = [
                  {
                    value: stats.totalSize > 0 ? stats.disabledSize / stats.totalSize : 0,
                    width: 28,
                    label: 'disabled',
                    trail: `${humanSize(stats.disabledSize)} / ${humanSize(stats.totalSize)}`,
                    color: t.warning,
                  },
                  ...stats.heaviest
                    ? [{
                        value: 1 as const,
                        width: 28,
                        label: 'heaviest',
                        trail: `${truncate(stats.heaviest.mod.displayName, maxTrail - 10)} (${humanSize(stats.heaviest.size)})`,
                        color: t.accent,
                      }]
                    : [],
                  {
                    value: Math.min(1, totalClasses / 200000),
                    width: 28,
                    label: 'classes',
                    trail: totalClasses > 0 ? `${totalClasses.toLocaleString()} loaded` : 'scanning…',
                    color: t.splitA,
                  },
                  {
                    value: Math.min(1, stats.avgDepth / Math.max(1, stats.maxDepth)),
                    width: 28,
                    label: 'avg dep depth',
                    trail: `${stats.avgDepth.toFixed(2)} / ${stats.maxDepth}`,
                    color: t.primary,
                  },
                ]
                return gauges.map((g, i) =>
                  <Box
                    key={g.label}
                    marginBottom={compact && i < gauges.length - 1 ? 1 : 0}
                  >
                    <Gauge
                      value={g.value}
                      width={g.width}
                      label={g.label}
                      trail={truncate(g.trail, maxTrail)}
                      color={g.color}
                      compact={compact}
                    />
                  </Box>
                )
              })()}
            </Panel>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row" justifyContent="center">
        <ModeButton label="① Manual Toggle" active={focus === 0} hint="select & flip individual mods" />
        <Box width={2} />
        <ModeButton label="② Binary Search" active={focus === 1} hint="isolate the bug culprit" />
        {fixDepsAvailable
          ?               <>
              <Box width={2} />
              <ModeButton label="③ Fix Deps" active={focus === 2} hint="resolve missing CF deps & forks" />
            </>

          : null}
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text color={t.fgMuted}>
          ←/→ switch · enter activate · 1/2
          {fixDepsAvailable ? '/3' : ''}
          {' '}
          jump · q quit
        </Text>
      </Box>

      <Box justifyContent="center">
        <Text color={t.fgMuted}>
          {mods.length === 0
            ? ''
            : cachedCount < mods.length
              ? `· caching jar metadata ${cachedCount}/${mods.length} …`
              : `✓ all ${mods.length} mods cached`}
        </Text>
      </Box>
    </Box>
  )
}

function warningsByMod(warnings: WarningEntry[]): Map<Mod, WarningEntry['kind']> {
  const map = new Map<Mod, WarningEntry['kind']>()
  for (const w of warnings) {
    const parent = w.data?.parent
    if (parent && !map.has(parent)) map.set(parent, w.kind)
  }
  return map
}

function ModeButton({ label, active, hint }: { label: string, active: boolean, hint: string }) {
  const t = useTheme()
  return (
    <Box
      flexDirection="column"
      borderStyle={active ? 'double' : 'round'}
      borderColor={active ? t.accent : t.fgMuted}
      paddingX={2}
      paddingY={0}
    >
      <Text bold color={active ? t.accent : t.fg}>{label}</Text>
      <Text color={active ? t.fgDim : t.fgMuted}>{hint}</Text>
    </Box>
  )
}
