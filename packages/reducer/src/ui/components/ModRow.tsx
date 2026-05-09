/* eslint-disable style/no-extra-parens */
/* eslint-disable style/jsx-one-expression-per-line */
import type { Mod } from '../../Mod.js'
import { Box, Text } from 'ink'
import React from 'react'
import stringWidth from 'string-width'
import { useTheme } from '../ThemeContext.js'
import { SizeBar } from './SizeBar.js'
import { highlight } from './useFuzzy.js'

export type SelectionMode = 'enabledMirror' | 'pickList'

interface ModRowProps {
  mod              : Mod
  /** Whether the row's checkbox is shown as ticked. */
  selected         : boolean
  isFocus          : boolean
  /** Tree-style prefix (e.g. "├─" or "│ └─") shown before the name. */
  prefix?          : string
  /** Match ranges relative to mod.displayName. */
  nameRanges?      : number[]
  /** Match ranges relative to mod.fileNameNoExt. */
  fileRanges?      : number[]
  /** Optional trailing message (e.g. error). */
  trail?           : string
  /** Optional bundle tint background (binary search). */
  tintColor?       : string
  /** Largest mod size in the current list — drives the SizeBar scale. */
  maxSize?         : number
  /** Reason the row's checkbox cannot be toggled (item 21). */
  lockReason?      : string
  /** Selection style — affects checkbox color (item 20). */
  mode?            : SelectionMode
  /** Fixed visual width for the displayName column (item 2). */
  nameWidth?       : number
  /** Fixed visual width for the fileNameNoExt column (item 2). */
  fileWidth?       : number
  /** Optional one-line description shown when there's room (item 12). */
  description?     : string
  /** Width budget for the description column; rendered only when >= 30. */
  descriptionWidth?: number
}

const ELLIPSIS = '…'

interface Truncated {
  text      : string
  /** Visible character count of the truncated string (excluding any padding). */
  displayLen: number
  truncated : boolean
  /** Maps match ranges from the original string to the truncated string. */
  mapRanges : (ranges: number[]) => number[]
}

function clipRanges(ranges: number[], maxIndex: number): number[] {
  const out: number[] = []
  for (let i = 0; i < ranges.length; i += 2) {
    const a = ranges[i]
    const b = ranges[i + 1]
    if (a >= maxIndex) break
    out.push(a, Math.min(b, maxIndex))
  }
  return out
}

/** Visual width of a string in terminal cells (East-Asian wide chars count as 2). */
function visualWidth(s: string): number {
  return stringWidth(s)
}

/**
 * Slice a string by visual width instead of code-unit count.
 * Returns the sliced text, accumulated visual width, and the original string index.
 */
function visualSlice(s: string, maxVisual: number, fromEnd = false): { text: string, visual: number, index: number } {
  if (fromEnd) {
    const chars = Array.from(s)
    let visual = 0
    let index = s.length
    for (let i = chars.length - 1; i >= 0; i--) {
      const w = stringWidth(chars[i])
      if (visual + w > maxVisual) break
      visual += w
      index -= chars[i].length
    }
    return { text: s.slice(index), visual, index }
  }

  let visual = 0
  let index = 0
  for (const ch of s) {
    const w = stringWidth(ch)
    if (visual + w > maxVisual) break
    visual += w
    index += ch.length
  }
  return { text: s.slice(0, index), visual, index }
}

/**
 * Truncate a string to at most `maxLen` cells, replacing the tail with U+2026
 * when the string was too long to fit. Properly counts East-Asian wide chars.
 */
function truncateRight(s: string, maxLen: number): Truncated {
  if (maxLen <= 0)
    return { text: '', displayLen: 0, truncated: visualWidth(s) > 0, mapRanges: () => [] }
  if (visualWidth(s) <= maxLen)
    return { text: s, displayLen: visualWidth(s), truncated: false, mapRanges: r => r }
  if (maxLen === 1)
    return { text: ELLIPSIS, displayLen: 1, truncated: true, mapRanges: () => [] }
  const head = visualSlice(s, maxLen - 1)
  return {
    text      : `${head.text}${ELLIPSIS}`,
    displayLen: head.visual + 1,
    truncated : true,
    mapRanges : r => clipRanges(r, head.index),
  }
}

/**
 * Item 2 — `start…end` truncation. For mod jar filenames both the mod identity
 * (start) and the version (end) carry signal, so we keep both and elide the
 * middle. Match-range mapping splits each input range across the head/tail
 * halves, dropping anything that fell into the elided middle.
 */
function truncateMiddle(s: string, maxLen: number): Truncated {
  if (maxLen <= 0)
    return { text: '', displayLen: 0, truncated: visualWidth(s) > 0, mapRanges: () => [] }
  if (visualWidth(s) <= maxLen)
    return { text: s, displayLen: visualWidth(s), truncated: false, mapRanges: r => r }
  if (maxLen === 1)
    return { text: ELLIPSIS, displayLen: 1, truncated: true, mapRanges: () => [] }
  if (maxLen === 2) {
    const head = visualSlice(s, 1)
    return {
      text      : `${head.text}${ELLIPSIS}`,
      displayLen: head.visual + 1,
      truncated : true,
      mapRanges : r => clipRanges(r, head.index),
    }
  }
  const headBudget = Math.ceil((maxLen - 1) / 2)
  const tailBudget = maxLen - 1 - headBudget
  const head = visualSlice(s, headBudget)
  const tail = visualSlice(s, tailBudget, true)
  // Position p in the original string maps to (p + offset) in the truncated
  // string when p >= tail.index; the ellipsis takes one cell at index head.index.
  const offset = head.index + 1 - tail.index
  return {
    text      : `${head.text}${ELLIPSIS}${tail.text}`,
    displayLen: head.visual + 1 + tail.visual,
    truncated : true,
    mapRanges(ranges) {
      const out: number[] = []
      for (let i = 0; i < ranges.length; i += 2) {
        const a = ranges[i]
        const b = ranges[i + 1]
        // Head fragment of the range (before the elided middle).
        const ha = a
        const hb = Math.min(b, head.index)
        if (ha < hb) out.push(ha, hb)
        // Tail fragment of the range (after the elided middle).
        const ta = Math.max(a, tail.index)
        const tb = b
        if (ta < tb) out.push(ta + offset, tb + offset)
      }
      return out
    },
  }
}

export function ModRow({
  mod,
  selected,
  isFocus,
  prefix     = '',
  nameRanges = [],
  fileRanges = [],
  trail,
  tintColor,
  maxSize,
  lockReason,
  mode             = 'enabledMirror',
  nameWidth,
  fileWidth,
  description,
  descriptionWidth,
}: ModRowProps) {
  const t = useTheme()

  // Item 1 — when the row carries a tree-prefix (├─, └─, etc.) we shrink the
  // name budget by the prefix's length so the *combined* (prefix + name + pad)
  // width always equals `nameWidth`. That keeps every column to the right
  // (file decoration, size bar, description) aligned across rows regardless of
  // tree depth — only the name itself shortens as the indent grows.
  const nameBudget = nameWidth !== undefined
    ? Math.max(1, nameWidth - stringWidth(prefix))
    : undefined
  const nameTrunc = nameBudget !== undefined
    ? truncateRight(mod.displayName, nameBudget)
    : { text: mod.displayName, displayLen: stringWidth(mod.displayName), truncated: false, mapRanges: (r: number[]) => r }
  const namePad = nameBudget !== undefined ? Math.max(0, nameBudget - nameTrunc.displayLen) : 0
  const nameTokens = highlight(nameTrunc.text, nameTrunc.mapRanges(nameRanges))

  // Item 2 — filenames carry signal at both ends (mod id at the start, version
  // at the end), so use start…end truncation here instead of trailing-only.
  const fileTrunc = fileWidth !== undefined
    ? truncateMiddle(mod.fileNameNoExt, fileWidth)
    : { text: mod.fileNameNoExt, displayLen: stringWidth(mod.fileNameNoExt), truncated: false, mapRanges: (r: number[]) => r }
  const filePad = fileWidth !== undefined ? Math.max(0, fileWidth - fileTrunc.displayLen) : 0
  const fileTokens = highlight(fileTrunc.text, fileTrunc.mapRanges(fileRanges))

  // Item 6 — geometric chars (●/○/▢, ▪/▫/▬) all sit in the East-Asian
  // Ambiguous width class, which means Windows terminals can render them at
  // different cell widths than Ink's layout assumes. Switching to ASCII
  // bracket form ([*] [ ] [-]) sidesteps the issue entirely — every glyph
  // takes exactly 3 cells and never shifts the row contents.
  const checkboxGlyph = lockReason ? '[-]' : selected ? '[*]' : '[ ]'
  const checkboxColor = lockReason
    ? t.fgMuted
    : selected
      ? (mode === 'pickList' ? t.accent : t.success)
      : t.fgMuted

  const cursorGlyph = isFocus ? '>' : ' '
  const cursorColor = isFocus ? t.accent : t.fg

  const nameColor = mod.disabled ? t.fgMuted : t.fg
  const fileColor = mod.disabled ? t.fgMuted : t.fgDim
  const decorationColor = t.fgMuted

  const size = mod.addon?.installedFile.fileLength
  const showBar = typeof size === 'number' && typeof maxSize === 'number' && maxSize > 0

  const trailText = lockReason ?? trail
  const trailColor = lockReason ? t.fgMuted : t.danger

  const showDescription = !!description
    && descriptionWidth !== undefined
    && descriptionWidth >= 30
  const descriptionText = showDescription
    ? truncateRight(description, descriptionWidth).text
    : ''

  // Item 3 — give the focused row a barely-perceptible background so the eye
  // can find the cursor on long, dense rows. Bundle tints (binary search) win
  // because they encode separately-meaningful state; otherwise focus shows.
  const backgroundColor = tintColor ?? (isFocus ? t.rowFocus : undefined)

  return (
    <Box backgroundColor={backgroundColor}>
      <Box width={2}>
        <Text color={cursorColor} bold={isFocus}>{cursorGlyph}</Text>
      </Box>
      <Box width={3}>
        <Text color={checkboxColor}>{checkboxGlyph}</Text>
      </Box>
      <Text>{' '}</Text>
      {prefix
        ? <Text color={t.fgMuted}>{prefix}</Text>
        : null}
      {nameTokens.map((tok, i) => (
        <Text key={`n${i}`} color={tok.match ? t.accent : nameColor} bold={tok.match}>
          {tok.text}
        </Text>
      ))}
      {namePad > 0 ? <Text>{' '.repeat(namePad)}</Text> : null}
      {mod.addon
        ? (
            <>
              <Text color={decorationColor}>{' ◂'}</Text>
              {fileTokens.map((tok, i) => (
                <Text key={`f${i}`} color={tok.match ? t.accent : fileColor} bold={tok.match}>
                  {tok.text}
                </Text>
              ))}
              <Text color={decorationColor}>▸</Text>
              {filePad > 0 ? <Text>{' '.repeat(filePad)}</Text> : null}
            </>
          )
        : (fileWidth !== undefined
            ? <Text>{' '.repeat(fileWidth + 3)}</Text>
            : null)}
      {showBar
        ? (
            <Box marginLeft={1}>
              <SizeBar value={size} max={maxSize} width={10} noTrail />
            </Box>
          )
        : null}
      {showDescription
        ? (
            <Box marginLeft={1}>
              <Text color={t.fgMuted}>{descriptionText}</Text>
            </Box>
          )
        : null}
      {trailText
        ? <Text color={trailColor}>{' '}{trailText}</Text>
        : null}
    </Box>
  )
}
