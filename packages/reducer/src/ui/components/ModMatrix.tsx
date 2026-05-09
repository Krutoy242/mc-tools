/* eslint-disable style/no-extra-parens */
import type { DependencyBundle, Status, StatusMap } from '../../binarySearch.js'
import type { Mod } from '../../Mod.js'
import { Box, Text } from 'ink'
import React from 'react'
import { getStatus } from '../../binarySearch.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { useTheme } from '../ThemeContext.js'

interface ModMatrixProps {
  mods   : Mod[]
  status : StatusMap
  bundles: DependencyBundle[]
}

const GLYPH_ENABLED  = '▰'
const GLYPH_DISABLED = '▱'

function colorFor(s: Status, enabled: boolean, t: ReturnType<typeof useTheme>): string {
  if (s === 'trusted')  return enabled ? t.success : t.statusTrusted
  if (s === 'ignored')  return enabled ? t.statusIgnored : t.fgMuted
  return enabled ? t.warning : t.statusSuspect
}

export function ModMatrix({ mods, status, bundles }: ModMatrixProps) {
  const t = useTheme()
  const { columns } = useTerminalSize()
  // Each cell is one cell wide; cap to terminal columns minus borders.
  const w = Math.max(20, Math.min(columns - 6, mods.length))

  const bundleByMod = new Map<Mod, number>()
  for (const b of bundles) {
    for (const m of b.members) bundleByMod.set(m, b.id)
  }

  const rows: { mod: Mod, color: string, glyph: string, tint?: string }[][] = []
  let row: { mod: Mod, color: string, glyph: string, tint?: string }[] = []
  for (const m of mods) {
    const s = getStatus(status, m)
    const tint = bundleByMod.has(m)
      ? t.bundleTints[bundleByMod.get(m)! % t.bundleTints.length]
      : undefined
    row.push({
      mod  : m,
      color: colorFor(s, m.enabled, t),
      glyph: m.enabled ? GLYPH_ENABLED : GLYPH_DISABLED,
      tint,
    })
    if (row.length >= w) {
      rows.push(row)
      row = []
    }
  }
  if (row.length) rows.push(row)

  return (
    <Box flexDirection="column">
      {rows.map((r, ri) =>
        <Box key={ri} flexDirection="row">
          {r.map((cell, ci) => (
            <Text key={ci} color={cell.color} backgroundColor={cell.tint}>{cell.glyph}</Text>
          ))}
        </Box>

      )}
    </Box>
  )
}
