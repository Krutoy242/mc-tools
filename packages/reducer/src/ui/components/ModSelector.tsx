import type { DescriptionService } from '../../descriptionService.js'
import type { JarMetaLoader } from '../../jarMeta.js'
import type { Mod } from '../../Mod.js'
import type { SelectionMode } from './ModRow.js'
import { Box, Text, useInput } from 'ink'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import stringWidth from 'string-width'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { useTheme } from '../ThemeContext.js'
import { ModCard } from './ModCard.js'
import { ModRow } from './ModRow.js'
import { sliceRanges, useFuzzy } from './useFuzzy.js'
import { useVirtualWindow } from './useVirtualWindow.js'

export type ToggleResult = { ok: true } | { ok: false, error: string }

export interface ModSelectorProps {
  mods            : Mod[]
  /** Mods initially marked as selected (e.g. currently enabled). */
  initialSelected?: Mod[]
  /** When set, the selector sticks around after Enter is pressed; otherwise it returns the selection. */
  multiSelect?    : boolean
  /**
   * Optional toggle handler. When provided, the selector calls it on Space and
   * displays inline errors if it returns { ok: false }. Otherwise selection
   * is purely virtual until the caller reads it back via onComplete.
   */
  onToggle?       : (mod: Mod, nextSelected: boolean) => Promise<ToggleResult> | ToggleResult
  onComplete      : (selected: Mod[]) => void
  onCancel?       : () => void
  loader?         : JarMetaLoader
  title?          : string
  /** Bundle tints keyed by mod, for binary search visualization. */
  bundleTints?    : Map<Mod, string>
  /** Largest mod size in the source list, drives ModRow's SizeBar scale. */
  maxSize?        : number
  /**
   * Selection styling. `enabledMirror` shows the checkbox green when the mod
   * is enabled (Manual mode); `pickList` shows the checkbox in the accent
   * color and ignores the mod's actual enabled state (Binary trusted/ignored).
   */
  mode?           : SelectionMode
  /**
   * If provided, returns a non-empty reason to mark a mod as locked (its
   * checkbox cannot be toggled and the reason is shown in the row's trail).
   * Used by Binary search to prevent picking a mod that is already classified
   * (e.g. trusted while the user is picking ignored).
   */
  isLocked?       : (mod: Mod) => string | undefined
  /**
   * Lazy resolver for one-line mod descriptions, used by the adaptive layout
   * (item 12). When omitted, no description column is shown.
   */
  descriptions?   : DescriptionService
}

/**
 * Compute a length cap for name/file columns: drop the longest 1% (≥1 mod)
 * and use the next-longest length as the cap. Mods longer than that cap
 * render with a trailing U+2026 ellipsis. Item 2.
 */
function percentileMaxLen(values: number[]): number {
  if (values.length === 0) return 0
  const cap = Math.max(1, Math.floor(values.length * 0.01))
  const sorted = [...values].sort((a, b) => b - a)
  return sorted[cap] ?? sorted[sorted.length - 1] ?? 0
}

interface RowEntry {
  mod       : Mod
  prefix    : string
  nameRanges: number[]
  fileRanges: number[]
  /** Inline error to show on the row, if any. */
  trail?    : string
}

const TREE_BRANCH = '├─'
const TREE_LAST   = '└─'

/**
 * Reusable, virtualized mod-selection component. Used by both Manual Toggle and
 * Binary Search modes. Driven by props, no module-global state.
 */
export function ModSelector({
  mods,
  initialSelected = [],
  multiSelect = true,
  onToggle,
  onComplete,
  onCancel,
  loader,
  title = 'Toggle mods',
  bundleTints,
  maxSize,
  mode = 'enabledMirror',
  isLocked,
  descriptions,
}: ModSelectorProps) {
  const t = useTheme()
  const { rows: termRows, columns, breakpoint } = useTerminalSize()

  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState<Set<Mod>>(() => new Set(initialSelected))
  const [focus, setFocus]       = useState(0)
  const [errors, setErrors]     = useState<Map<Mod, string>>(new Map())
  // Bumped whenever the description service finishes loading a description,
  // forcing a re-render so the new text shows up.
  const [, setDescTick]         = useState(0)

  // Item 2 — column widths derived from the source list, not the visible slice,
  // so the "size" column doesn't drift as the user types in the search box.
  const { nameWidth, fileWidth } = useMemo(() => ({
    nameWidth: percentileMaxLen(mods.map(m => stringWidth(m.displayName))),
    fileWidth: percentileMaxLen(mods.map(m => stringWidth(m.fileNameNoExt))),
  }), [mods])

  // Item 12 — adaptive description column. Available width = terminal columns
  // minus everything else on the row (cursor, checkbox, name, decoration,
  // file, bar, gutters). When < 30, hide the column entirely.
  const ROW_FIXED_OVERHEAD = 2 /* cursor box */ + 3 /* [*]/[ ]/[-] checkbox */
    + 1 /* gap-after-checkbox */ + 3 /* ◂...▸ decoration */
    + 1 /* gap-before-bar */ + 10 /* bar */
    + 1 /* gap-before-desc */ + 2 /* safety margin */
  const descriptionWidth = Math.max(0, columns - ROW_FIXED_OVERHEAD - nameWidth - fileWidth)
  const showDescriptions = !!descriptions && descriptionWidth >= 30

  const fuzzy = useFuzzy(mods, query, { haystack: m => m.displayRaw })

  // Build row list — show every matched mod, plus its dependents nested
  // underneath. Dependents that are themselves matched are only shown nested
  // (not at top level), so the tree reads as a single hierarchy instead of
  // duplicating mods.
  const entries: RowEntry[] = useMemo(() => {
    const matched = fuzzy
    const matchedSet = new Set(matched.map(r => r.item))
    const rangesByMod = new Map<Mod, number[]>(matched.map(r => [r.item, r.ranges]))
    const out: RowEntry[] = []
    const seen = new Set<Mod>()

    function rangesFor(mod: Mod) {
      const raw = rangesByMod.get(mod) ?? []
      const nameLen = mod.displayName.length
      const decorationLen = ' ◂'.length // matches Mod.displayRaw composition
      const fileLen = mod.fileNameNoExt.length
      return {
        nameRanges: sliceRanges(raw, 0, nameLen),
        fileRanges: sliceRanges(raw, nameLen + decorationLen, fileLen),
      }
    }

    function add(mod: Mod, prefix: string) {
      if (seen.has(mod)) return
      seen.add(mod)
      const { nameRanges, fileRanges } = rangesFor(mod)
      out.push({
        mod,
        prefix,
        nameRanges: prefix ? [] : nameRanges,
        fileRanges: prefix ? [] : fileRanges,
        trail     : errors.get(mod),
      })
      const deps = [...mod.dependents]
      deps.forEach((dep, i) => {
        const isLast = i === deps.length - 1
        const newPrefix = prefix.replace(/├─/g, '│ ').replace(/└─/g, '  ')
        add(dep, `${newPrefix}${isLast ? TREE_LAST : TREE_BRANCH}`)
      })
    }

    // Top-level pass: only include mods whose dependencies are NOT in the
    // matched set. Mods that have a matched parent will be visited via the
    // parent's dependents recursion above.
    for (const r of matched) {
      const hasMatchedParent = r.item.dependencies.some(d => matchedSet.has(d))
      if (hasMatchedParent) continue
      add(r.item, '')
    }
    // Safety net: include any matched mod we didn't reach (cyclic deps, etc.)
    for (const r of matched) {
      if (!seen.has(r.item)) add(r.item, '')
    }
    return out
  }, [fuzzy, errors])

  // Keep focus inside bounds when the list shrinks (e.g. after typing).
  useEffect(() => {
    if (focus >= entries.length) setFocus(Math.max(0, entries.length - 1))
  }, [entries.length, focus])

  // Card occupies ~9 rows on lg/md; on sm we hide it. Search bar + footer ≈ 4 rows.
  const cardRows   = breakpoint === 'sm' ? 0 : 9
  const reservedUI = 6 + cardRows
  const listHeight = Math.max(5, termRows - reservedUI)

  const window = useVirtualWindow(entries.length, focus, listHeight)
  const focusEntry = entries[focus]
  const focusMod   = focusEntry?.mod

  // Adjacency-aware prefetch around the focused row.
  useEffect(() => {
    if (!loader || !focusMod) return
    const idx = mods.indexOf(focusMod)
    if (idx >= 0) loader.prefetch(mods, idx, 5)
  }, [loader, focusMod, mods])

  // Item 12 — schedule mcmod.info reads for the visible rows when the
  // description column is wide enough to show them. Subscribe so the row
  // re-renders when each description resolves.
  useEffect(() => {
    if (!showDescriptions || !descriptions) return
    return descriptions.subscribe(() => setDescTick(n => n + 1))
  }, [descriptions, showDescriptions])
  useEffect(() => {
    if (!showDescriptions || !descriptions) return
    // Schedule the visible window plus a small buffer so descriptions are
    // ready by the time the user scrolls into them.
    descriptions.prefetch(mods)
  }, [descriptions, showDescriptions, mods])

  const flashError = useCallback((mod: Mod, message: string) => {
    setErrors(prev => new Map(prev).set(mod, message))
    setTimeout(() => {
      setErrors((prev) => {
        if (!prev.has(mod)) return prev
        const m = new Map(prev)
        m.delete(mod)
        return m
      })
    }, 1500)
  }, [])

  const doToggle = useCallback(async (mod: Mod, nextSel: boolean) => {
    const lock = isLocked?.(mod)
    if (lock) {
      flashError(mod, lock)
      return
    }
    if (onToggle) {
      const r = await onToggle(mod, nextSel)
      if (r.ok) {
        setErrors((prev) => {
          if (!prev.has(mod)) return prev
          const m = new Map(prev)
          m.delete(mod)
          return m
        })
        setSelected((prev) => {
          const s = new Set(prev)
          if (mod.enabled) s.add(mod)
          else s.delete(mod)
          return s
        })
      }
      else {
        setErrors(prev => new Map(prev).set(mod, r.error))
      }
    }
    else {
      setSelected((prev) => {
        const s = new Set(prev)
        if (multiSelect) {
          if (nextSel) s.add(mod)
          else s.delete(mod)
        }
        else {
          s.clear()
          if (nextSel) s.add(mod)
        }
        return s
      })
    }
  }, [onToggle, multiSelect, isLocked, flashError])

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel?.()
      return
    }
    if (key.return) {
      onComplete([...selected])
      return
    }
    if (key.upArrow) {
      setFocus(f => entries.length === 0 ? 0 : (f - 1 + entries.length) % entries.length)
      return
    }
    if (key.downArrow) {
      setFocus(f => entries.length === 0 ? 0 : (f + 1) % entries.length)
      return
    }
    if (key.pageUp) {
      setFocus(f => Math.max(0, f - listHeight))
      return
    }
    if (key.pageDown) {
      setFocus(f => Math.min(entries.length - 1, f + listHeight))
      return
    }
    if (input === ' ') {
      if (focusMod) void doToggle(focusMod, !selected.has(focusMod))
      return
    }
    if (key.ctrl && input === 'a') {
      // Enable all *visible* (matching) top-level mods.
      const targets = entries.filter(e => !e.prefix).map(e => e.mod)
      void Promise.all(targets.map(async m => doToggle(m, true)))
      return
    }
    if (key.ctrl && input === 'r') {
      const targets = entries.filter(e => !e.prefix).map(e => e.mod)
      void Promise.all(targets.map(async m => doToggle(m, false)))
      return
    }
    if (key.backspace || key.delete) {
      setQuery(q => q.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setQuery(q => q + input)
    }
  })

  const enabledCount = mods.filter(m => m.enabled).length

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={t.fg}>{title}</Text>
        <Text color={t.fgMuted}>
          {'  '}
          ↑↓ nav · space toggle · ⌃A all · ⌃R none · enter save · esc back
        </Text>
      </Box>
      <Box>
        <Text color={t.accent}>
          ›
          {' '}
        </Text>
        <Text>{query}</Text>
        <Text color={t.fgMuted} dimColor>
          {'  '}
          {entries.length}
          /
          {mods.length}
          {' '}
          match
        </Text>
        <Text color={t.fgDim}>
          {'  ·  '}
          {enabledCount}
          {' '}
          on /
          {mods.length - enabledCount}
          {' '}
          off
        </Text>
      </Box>

      <Box flexDirection="column" height={listHeight} marginY={1}>
        {window.visible.map((idx) => {
          const e = entries[idx]
          if (!e) return null
          const lockReason = isLocked?.(e.mod)
          const isSelected = mode === 'enabledMirror'
            ? selected.has(e.mod) || e.mod.enabled
            : selected.has(e.mod)
          return (
            <ModRow
              key={`${e.mod.fileName}-${e.prefix}`}
              mod={e.mod}
              prefix={e.prefix}
              nameRanges={e.nameRanges}
              fileRanges={e.fileRanges}
              selected={isSelected}
              isFocus={idx === focus}
              trail={e.trail}
              tintColor={bundleTints?.get(e.mod)}
              maxSize={maxSize}
              lockReason={lockReason}
              mode={mode}
              nameWidth={nameWidth}
              fileWidth={fileWidth}
              description={showDescriptions ? descriptions?.get(e.mod) : undefined}
              descriptionWidth={showDescriptions ? descriptionWidth : undefined}
            />
          )
        })}
      </Box>

      {breakpoint !== 'sm' && focusMod
        && <ModCard mod={focusMod} loader={loader} maxSize={maxSize} />}
    </Box>
  )
}
