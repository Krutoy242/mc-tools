import type { ReducerCache } from '../../cache.js'
import type { McmodInfoEntry } from '../../jarMeta.js'
import type { Mod } from '../../Mod.js'
import type { WarningEntry } from '../../ModStore.js'
import process from 'node:process'
import { fetchMods } from '@mctools/curseforge'
import levenshtein from 'fast-levenshtein'
import { Box, Text, useInput } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'
import { writeForkToConfig } from '../../config.js'
import { loadJarMcmodInfo } from '../../jarMeta.js'
import { Mod as ModClass } from '../../Mod.js'
import { Panel } from '../layout/Panel.js'
import { useTheme } from '../ThemeContext.js'

interface FixDepsProps {
  mcPath  : string
  mods    : Mod[]
  warnings: WarningEntry[]
  cache?  : ReducerCache
  onDone  : () => void
}

interface CFInfo {
  id     : number
  name   : string
  summary: string
}

interface MissingItem {
  /** The mod that has the unmet dependency. */
  parent     : Mod
  /** Numeric CurseForge addon id of the missing dep, when known. */
  addonId?   : number
  /** Free-form name of the missing custom dep, when CF id isn't available. */
  customName?: string
  /** Resolved CF info once fetched. */
  cfInfo?    : CFInfo
  /** Sibling deps of `parent` that DID resolve, for context in the UI. */
  siblings   : Mod[]
}

interface OrphanItem {
  mod : Mod
  info: McmodInfoEntry[] | undefined
}

type Mode = 'missing' | 'orphans'

export function FixDeps({ mcPath, mods, warnings, cache, onDone }: FixDepsProps) {
  const t = useTheme()
  const [mode, setMode] = useState<Mode>('missing')
  const [missing, setMissing] = useState<MissingItem[]>(() => buildMissing(warnings))
  const [orphans, setOrphans] = useState<OrphanItem[]>(() =>
    warnings.filter(w => w.kind === 'noAddon' && w.data?.parent).map(w => ({ mod: w.data!.parent!, info: undefined })))
  const [missingFocus, setMissingFocus] = useState(0)
  const [pickFocus, setPickFocus] = useState(0)
  const [orphanFocus, setOrphanFocus] = useState(0)
  const [query, setQuery] = useState('')
  const [info, setInfo]   = useState('')
  const [busy, setBusy]   = useState(false)

  const apiKey = process.env.CF_API_KEY

  // Background-load CF metadata for all missing deps with addonIds.
  useEffect(() => {
    if (!apiKey) return
    const ids = missing.filter(m => m.addonId && !m.cfInfo).map(m => m.addonId!)
    if (!ids.length) return
    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchMods(ids, apiKey)
        if (cancelled) return
        setMissing(prev => prev.map((m) => {
          if (!m.addonId) return m
          const hit = fetched.find(c => c.id === m.addonId)
          if (!hit) return m
          return { ...m, cfInfo: { id: hit.id, name: hit.name, summary: hit.summary ?? '' } }
        }))
      }
      catch (e) {
        if (!cancelled) setInfo(`CurseForge fetch failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiKey, missing])

  // Lazy-load mcmod.info for the focused orphan.
  const focusedOrphan = orphans[orphanFocus]
  useEffect(() => {
    if (mode !== 'orphans' || !focusedOrphan || focusedOrphan.info !== undefined) return
    let cancelled = false
    void (async () => {
      try {
        const info = await loadJarMcmodInfo(ModClass.modsPath, focusedOrphan.mod.fileName, cache)
        if (cancelled) return
        setOrphans(prev => prev.map(o => o.mod === focusedOrphan.mod ? { ...o, info: info ?? [] } : o))
      }
      catch { /* ignore */ }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, focusedOrphan, cache])

  const focusedMissing = missing[missingFocus]

  const candidates = useMemo(() => {
    if (!focusedMissing) return [] as { mod: Mod, score: number }[]
    const targetName = focusedMissing.cfInfo?.name ?? focusedMissing.customName ?? ''
    return mods
      .filter(m => m.addon)
      .filter((m) => {
        if (!query) return true
        const q = query.toLowerCase()
        return m.displayName.toLowerCase().includes(q)
          || m.fileNameNoExt.toLowerCase().includes(q)
      })
      .map(m => ({
        mod  : m,
        // Item 2: prefer token/substring matches over raw edit distance —
        // "Avaritia 1.1x Unofficial Extended Life" should beat random short
        // names against the target "Avaritia". Levenshtein still acts as a
        // tiebreaker for cases where no shared tokens exist.
        score: similarityScore(targetName, m.displayName),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [focusedMissing, mods, query])

  useInput((input, key) => {
    if (busy) return
    if (key.escape || (key.ctrl && input === 'c')) {
      onDone()
      return
    }
    if (input === '\t' || (key.tab && !key.shift)) {
      setMode(m => m === 'missing' ? 'orphans' : 'missing')
      return
    }
    if (mode === 'missing') {
      if (key.upArrow && key.shift) {
        setMissingFocus(f => Math.max(0, f - 1))
        setPickFocus(0)
        return
      }
      if (key.downArrow && key.shift) {
        setMissingFocus(f => Math.min(Math.max(0, missing.length - 1), f + 1))
        setPickFocus(0)
        return
      }
      if (key.upArrow) {
        setPickFocus(f => candidates.length === 0 ? 0 : (f - 1 + candidates.length) % candidates.length)
        return
      }
      if (key.downArrow) {
        setPickFocus(f => candidates.length === 0 ? 0 : (f + 1) % candidates.length)
        return
      }
      if (key.return) {
        const pick = candidates[pickFocus]
        if (!pick || !focusedMissing?.addonId || !pick.mod.addon) {
          setInfo('cannot save fork — missing addon id')
          return
        }
        setBusy(true)
        void (async () => {
          try {
            // Pass the *base* mod name so writeForkToConfig can attach it as
            // an inline `# Tinker's Construct`-style comment (item 3).
            const baseName = focusedMissing.cfInfo?.name ?? focusedMissing.customName
            const path = await writeForkToConfig(
              mcPath,
              focusedMissing.addonId!,
              pick.mod.addon!.addonID,
              baseName
            )
            setInfo(`saved fork ${pick.mod.displayName} → ${path}`)
            setMissing(prev => prev.filter(m => m !== focusedMissing))
            setMissingFocus(0)
            setPickFocus(0)
          }
          catch (e) {
            setInfo(`failed: ${e instanceof Error ? e.message : String(e)}`)
          }
          finally { setBusy(false) }
        })()
        return
      }
      if (input === ' ') {
        setMissing(prev => prev.filter(m => m !== focusedMissing))
        setInfo('skipped (not a fork)')
        return
      }
      if (key.backspace || key.delete) {
        setQuery(q => q.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setQuery(q => q + input)
      }
    }
    else {
      if (key.upArrow) {
        setOrphanFocus(f => orphans.length === 0 ? 0 : (f - 1 + orphans.length) % orphans.length)
        return
      }
      if (key.downArrow) {
        setOrphanFocus(f => orphans.length === 0 ? 0 : (f + 1) % orphans.length)
      }
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color={t.primary}>◆ Fix Dependencies</Text>
        <Text color={t.fgMuted}>
          {'   '}
          tab switch · esc back
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={mode === 'missing' ? t.accent : t.fgMuted} bold={mode === 'missing'}>
          [
          {missing.length}
          ] missing-dep
        </Text>
        <Text>{'    '}</Text>
        <Text color={mode === 'orphans' ? t.accent : t.fgMuted} bold={mode === 'orphans'}>
          [
          {orphans.length}
          ] no-addon
        </Text>
        {!apiKey
          ? <Text color={t.warning}>
              {'    '}
            ⚠ set CURSEFORGE_API_KEY for CF lookups
            </Text>
          : null}
      </Box>

      {mode === 'missing'
        ? renderMissing(missing, missingFocus, focusedMissing, candidates, pickFocus, query, info, t)
        : renderOrphans(orphans, orphanFocus, focusedOrphan, info, t)}
    </Box>
  )
}

function renderMissing(
  missing : MissingItem[],
  missingFocus: number,
  focused : MissingItem | undefined,
  candidates: { mod: Mod, score: number }[],
  pickFocus : number,
  query   : string,
  info    : string,
  t       : ReturnType<typeof useTheme>
) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box flexGrow={1} marginRight={1}>
          <Panel title="MISSING DEPENDENCIES" variant="strong" flexGrow={1}>
            {missing.length === 0
              ? <Text color={t.fgMuted}>none — all dependencies resolved</Text>
              : missing.slice(0, 8).map((m, i) =>
                  <Box key={i}>
                    <Text color={i === missingFocus ? t.accent : t.fgMuted}>{i === missingFocus ? '❯ ' : '  '}</Text>
                    <Text color={i === missingFocus ? t.fg : t.fgDim}>
                      {m.parent.displayName}
                      {' '}
                      →
                      {m.cfInfo?.name ?? (m.addonId ? `id ${m.addonId}` : m.customName ?? '?')}
                    </Text>
                  </Box>
                )}
            {missing.length > 8
              ? <Text color={t.fgMuted}>
                  {' '}
                …and
                  {missing.length - 8}
                  {' '}
                more
                </Text>
              : null}
          </Panel>
        </Box>

        {focused
          ?               <Box flexGrow={1}>
              <Panel title="DETAIL" variant="accent" flexGrow={1}>
                <Text color={t.fgDim}>parent</Text>
                <Text color={t.fg}>
                  {'  '}
                  {focused.parent.displayName}
                  {' '}
                  (
                  {focused.parent.fileName}
                  )
                </Text>
                <Text color={t.fgDim}>missing</Text>
                <Text color={t.warning}>
                  {'  '}
                  {focused.cfInfo?.name ?? focused.customName ?? `id ${focused.addonId ?? '?'}`}
                </Text>
                {focused.cfInfo?.summary
                  ? <Text color={t.fgMuted}>
                      {' '}
                      {focused.cfInfo.summary}
                    </Text>
                  : null}
                {focused.siblings.length > 0
                  ?                         <>
                      <Text color={t.fgDim}>siblings (resolved)</Text>
                      <Text color={t.success}>
                        {'  ✓ '}
                        {focused.siblings.map(s => s.displayName).join(', ')}
                      </Text>
                    </>

                  : null}
              </Panel>
            </Box>

          : null}
      </Box>

      {focused
        ?             <Box marginTop={1}>
            <Panel title="CANDIDATES — closest installed mods (Enter to confirm fork, Space to skip)">
              <Box>
                <Text color={t.accent}>›</Text>
                <Text>
                  {' '}
                  {query}
                </Text>
              </Box>
              {candidates.length === 0
                ? <Text color={t.fgMuted}>no installed mods</Text>
                : candidates.slice(0, 12).map((c, i) =>
                    <Box key={i}>
                      <Text color={i === pickFocus ? t.accent : t.fgMuted}>{i === pickFocus ? '❯ ' : '  '}</Text>
                      <Text color={i === pickFocus ? t.fg : t.fgDim}>
                        {c.mod.displayName}
                      </Text>
                      <Text color={t.fgMuted}>
                        {'  '}
                        #
                        {c.mod.addon?.addonID}
                        {'  ≈'}
                        {Math.round(c.score)}
                      </Text>
                    </Box>
                  )}
            </Panel>
          </Box>

        : null}

      {info
        ? <Text color={t.fgDim}>
            {'  '}
            {info}
          </Text>
        : null}
      <Text color={t.fgMuted}>↑↓ pick candidate · shift+↑↓ next missing · type to filter · enter save · space skip</Text>
    </Box>
  )
}

function renderOrphans(
  orphans : OrphanItem[],
  orphanFocus: number,
  focused : OrphanItem | undefined,
  info    : string,
  t       : ReturnType<typeof useTheme>
) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box flexGrow={1} marginRight={1}>
          <Panel title="ORPHAN JARS — no CurseForge addon" flexGrow={1}>
            {orphans.length === 0
              ? <Text color={t.fgMuted}>none</Text>
              : orphans.slice(0, 12).map((o, i) =>
                  <Box key={i}>
                    <Text color={i === orphanFocus ? t.accent : t.fgMuted}>{i === orphanFocus ? '❯ ' : '  '}</Text>
                    <Text color={i === orphanFocus ? t.fg : t.fgDim}>{o.mod.fileName}</Text>
                  </Box>
                )}
            {orphans.length > 12
              ? <Text color={t.fgMuted}>
                  {' '}
                …and
                  {orphans.length - 12}
                  {' '}
                more
                </Text>
              : null}
          </Panel>
        </Box>

        {focused
          ?               <Box flexGrow={1}>
              <Panel title="MCMOD.INFO" variant="accent" flexGrow={1}>
                {focused.info === undefined
                  ? <Text color={t.fgMuted}>reading jar…</Text>
                  : focused.info.length === 0
                    ? <Text color={t.fgMuted}>no mcmod.info inside this jar</Text>
                    : focused.info.map((entry, i) =>
                        <Box key={i} flexDirection="column">
                          <Text color={t.fg} bold>
                            {entry.name ?? entry.modid ?? '(unnamed)'}
                            {entry.version ? ` ${entry.version}` : ''}
                          </Text>
                          {entry.modid
                            ? <Text color={t.fgDim}>
                                {' '}
                              modid:
                                {entry.modid}
                              </Text>
                            : null}
                          {entry.authorList?.length
                            ? <Text color={t.fgDim}>
                                {' '}
                              by:
                                {entry.authorList.join(', ')}
                              </Text>
                            : null}
                          {entry.description
                            ? <Text color={t.fgMuted}>
                                {' '}
                                {entry.description.replace(/\s+/g, ' ').trim()}
                              </Text>
                            : null}
                          {entry.dependencies?.length
                            ? <Text color={t.fgDim}>
                                {' '}
                              requires:
                                {entry.dependencies.join(', ')}
                              </Text>
                            : null}
                        </Box>
                      )}
              </Panel>
            </Box>

          : null}
      </Box>

      {info
        ? <Text color={t.fgDim}>
            {'  '}
            {info}
          </Text>
        : null}
      <Text color={t.fgMuted}>↑↓ navigate · esc back</Text>
    </Box>
  )
}

/**
 * Item 2 — score how likely `candidate` is a fork of `target`. Higher is better.
 *
 * Pure Levenshtein punished long-named forks ("Avaritia 1.1x Unofficial
 * Extended Life") against short base names ("Avaritia"), so this scorer
 * weights signals roughly:
 *   - whole-word substring containment (strongest — handles the Avaritia case)
 *   - shared whole tokens
 *   - shared token prefixes / inclusion
 *   - Levenshtein distance only as a tiny tiebreaker
 *
 * Punctuation/case-insensitive: both strings are lowercased and split on
 * non-alnum so `Tinker's` ↔ `Tinkers` ↔ `tinker_s` all match.
 */
function similarityScore(target: string, candidate: string): number {
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const t = normalize(target)
  const c = normalize(candidate)
  if (!t || !c) return 0
  if (t === c) return 10000

  let score = 0

  // Whole-word substring of target inside candidate is the strongest signal.
  const wrappedC = ` ${c} `
  if (wrappedC.includes(` ${t} `)) score += 5000 + t.length * 20
  else if (c.includes(t)) score += 2000 + t.length * 10
  else if (t.includes(c)) score += 1000 + c.length * 10

  const tTokens = t.split(' ').filter(w => w.length >= 2)
  const cTokens = c.split(' ').filter(w => w.length >= 2)
  const cTokenSet = new Set(cTokens)
  for (const tok of tTokens) {
    if (cTokenSet.has(tok)) {
      score += 100 + tok.length * 20
      continue
    }
    for (const ct of cTokens) {
      if (tok.length >= 3 && ct.startsWith(tok)) {
        score += tok.length * 10
        break
      }
      if (ct.length >= 3 && tok.startsWith(ct)) {
        score += ct.length * 8
        break
      }
      if (tok.length >= 4 && ct.includes(tok)) {
        score += tok.length * 6
        break
      }
    }
  }

  // Tiebreakers — small enough not to flip a clear token match.
  score -= levenshtein.get(t, c) * 0.5
  score -= Math.abs(t.length - c.length) * 0.05
  return score
}

function buildMissing(warnings: WarningEntry[]): MissingItem[] {
  const items: MissingItem[] = []
  // Group by parent so we can show sibling resolved deps for context.
  const allByParent = new Map<Mod, WarningEntry[]>()
  for (const w of warnings) {
    const parent = w.data?.parent
    if (!parent) continue
    if (w.kind !== 'noDependencies' && w.kind !== 'missingDependency') continue
    if (!allByParent.has(parent)) allByParent.set(parent, [])
    allByParent.get(parent)!.push(w)
  }
  for (const [parent, ws] of allByParent) {
    for (const w of ws) {
      items.push({
        parent,
        addonId   : w.data?.missingAddonId,
        customName: w.data?.missingMod,
        siblings  : parent.dependencies, // resolved deps (the unresolved ones never made it onto the array)
      })
    }
  }
  return items
}
