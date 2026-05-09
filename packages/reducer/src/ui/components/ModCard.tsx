/* eslint-disable style/no-extra-parens */
/* eslint-disable style/jsx-one-expression-per-line */
import type { JarMeta, JarMetaLoader } from '../../jarMeta.js'
import type { Mod } from '../../Mod.js'
import { Box, Text } from 'ink'
import React, { useEffect, useState } from 'react'
import { Panel } from '../layout/Panel.js'
import { useTheme } from '../ThemeContext.js'
import { ModIdenticon } from './ModIdenticon.js'
import { humanSize, SizeBar } from './SizeBar.js'

interface ModCardProps {
  mod     : Mod
  loader? : JarMetaLoader
  maxSize?: number
}

export function ModCard({ mod, loader, maxSize }: ModCardProps) {
  const t = useTheme()
  const [meta, setMeta] = useState<JarMeta | undefined>(() => loader?.peek(mod))
  const [err, setErr] = useState<string | undefined>()

  useEffect(() => {
    if (!loader) return
    setMeta(loader.peek(mod))
    setErr(undefined)
    let cancelled = false
    loader.load(mod).then(
      (m) => { if (!cancelled) setMeta(m) },
      (e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      }
    )
    return () => {
      cancelled = true
    }
  }, [mod, loader])

  const reportedSize = mod.addon?.installedFile.fileLength
  const onDiskSize   = meta?.size
  const size = onDiskSize ?? reportedSize

  return (
    <Panel title={`◈ ${mod.displayName}`} variant="strong" subtitle={mod.disabled ? '⊘ disabled' : '◉ enabled'}>
      <Box flexDirection="row">
        <Box marginRight={2}>
          <ModIdenticon source={mod.fileNameNoExt} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Box>
            <Text color={t.fgDim}>file       </Text>
            <Text color={t.fg}>{mod.fileNameNoExt}</Text>
          </Box>
          {mod.addon && (
            <Box>
              <Text color={t.fgDim}>cf addon   </Text>
              <Text color={t.accent}>{mod.addon.name}</Text>
              <Text color={t.fgMuted}>{' '}#{mod.addon.addonID}</Text>
            </Box>
          )}
          <Box>
            <Text color={t.fgDim}>size       </Text>
            {typeof size === 'number' && typeof maxSize === 'number' && maxSize > 0
              ? <SizeBar value={size} max={maxSize} width={24} />
              : <Text color={t.fg}>{humanSize(size)}</Text>}
          </Box>
          <Box>
            <Text color={t.fgDim}>classes    </Text>
            <Text color={meta ? t.fg : t.fgMuted}>
              {meta ? `${meta.classCount} / ${meta.entryCount} entries` : 'reading…'}
            </Text>
          </Box>
          <Box>
            <Text color={t.fgDim}>dep depth  </Text>
            <Text color={t.fg}>{mod.getDepsLevel()}</Text>
            <Text color={t.fgMuted}>  ·  dependents </Text>
            <Text color={t.fg}>{mod.getDependentsCount()}</Text>
          </Box>
          {mod.dependencies.length > 0 && (
            <Box>
              <Text color={t.fgDim}>requires   </Text>
              <Text color={t.splitA}>{mod.dependencies.map(d => d.displayName).slice(0, 3).join(', ')}</Text>
              {mod.dependencies.length > 3
                ? <Text color={t.fgMuted}>{' '}+{mod.dependencies.length - 3}</Text>
                : null}
            </Box>
          )}
          {err
            ? <Text color={t.danger}>{'⚠ '}{err}</Text>
            : null}
        </Box>
      </Box>
    </Panel>
  )
}
