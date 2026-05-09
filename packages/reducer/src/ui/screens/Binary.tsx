import type { PartitionPlan, StatusMap } from '../../binarySearch.js'
import type { DescriptionService } from '../../descriptionService.js'
import type { JarMetaLoader } from '../../jarMeta.js'
import type { Mod, ModSwitchFailure  } from '../../Mod.js'
import type { IterationEntry } from '../components/IterationLog.js'
import { Box, Text, useInput } from 'ink'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  classifyAfterAnswer,
  computeBundles,
  countByStatus,
  getStatus,
  nextPartition,
} from '../../binarySearch.js'
import { Mod as ModClass } from '../../Mod.js'
import { IterationLog } from '../components/IterationLog.js'
import { ModMatrix } from '../components/ModMatrix.js'
import { ModSelector } from '../components/ModSelector.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Panel } from '../layout/Panel.js'
import { StatusChip } from '../layout/StatusChip.js'
import { useTheme } from '../ThemeContext.js'

interface BinaryProps {
  mods         : Mod[]
  loader?      : JarMetaLoader
  descriptions?: DescriptionService
  maxSize?     : number
  onDone       : () => void
}

type Phase
  = | { kind: 'menu' }
    | { kind: 'pickTrusted' }
    | { kind: 'pickIgnored' }
    | { kind: 'awaitAnswer', plan: PartitionPlan }
    | { kind: 'recover',     plan: PartitionPlan, failures: ModSwitchFailure[], applied: PartitionPlan | null }
    | { kind: 'confirmExit' }
    | { kind: 'culprit',     mod: Mod }

interface HistoryStep {
  before: StatusMap
  plan  : PartitionPlan
  answer: boolean | null
}

interface ActionItem {
  key  : '1' | '2' | '3'
  label: string
  hint : string
}

const ACTIONS: ActionItem[] = [
  { key: '1', label: 'pick TRUSTED', hint: 'known-good mods, kept disabled to speed up search' },
  { key: '2', label: 'pick IGNORED', hint: 'mods the algorithm won\'t touch (stay as-is)' },
  { key: '3', label: 'disable HALF', hint: 'bisect remaining suspects' },
]

const WIN_FRAMES = ['✦', '✧', '✶', '✺', '❉', '✺', '✶', '✧']

export function Binary({ mods, loader, descriptions, maxSize, onDone }: BinaryProps) {
  const t = useTheme()
  const { breakpoint } = useTerminalSize()
  const [status, setStatus]   = useState<StatusMap>(() => new Map())
  const [history, setHistory] = useState<HistoryStep[]>([])
  const [phase, setPhase]     = useState<Phase>({ kind: 'menu' })
  const [info, setInfo]       = useState<string>('')
  const [actionFocus, setActionFocus] = useState<0 | 1 | 2>(2)
  // Item 8 — most-recent-first list of mods whose enabled state changed,
  // used to sort the new ENABLED panel.
  const [recentChanges, setRecentChanges] = useState<Mod[]>([])
  // Item 7 — frame index for the culprit-found celebration animation.
  const [winFrame, setWinFrame] = useState(0)

  const recordChanges = useCallback((changed: Iterable<Mod>) => {
    const arr = [...changed]
    if (arr.length === 0) return
    setRecentChanges((prev) => {
      const set = new Set(arr)
      return [...arr, ...prev.filter(m => !set.has(m))].slice(0, 200)
    })
  }, [])

  useEffect(() => {
    if (phase.kind !== 'culprit') return
    const id = setInterval(() => setWinFrame(f => f + 1), 220)
    return () => clearInterval(id)
  }, [phase.kind])

  // Item 13: when background metadata is available, prefer to bisect heavy
  // mods (more classes = slower load) first by feeding the planner a
  // class-count-sorted view of the mods list.
  const orderedMods = useMemo(() => {
    if (!loader) return mods
    return [...mods].sort((a, b) => {
      const ca = loader.peek(a)?.classCount ?? 0
      const cb = loader.peek(b)?.classCount ?? 0
      return cb - ca
    })
  }, [mods, loader, history])

  const counts  = countByStatus(mods, status)
  const bundles = useMemo(() =>
    computeBundles(mods.filter(m => getStatus(status, m) === 'suspect')), [mods, status])

  const applyPlan = useCallback(async (plan: PartitionPlan) => {
    // Apply: disable first to free up files, then enable.
    const disResult = await ModClass.disable([...plan.disable])
    const enResult  = await ModClass.enable([...plan.enable])
    return [...disResult.failed, ...enResult.failed]
  }, [])

  const halve = useCallback(async () => {
    const plan = nextPartition(orderedMods, status)
    if (plan.disable.size === 0 || plan.disabledSuspects.size === 0) {
      setInfo('cannot bisect — try marking some as ignored or trusted manually')
      return
    }
    const failures = await applyPlan(plan)
    if (failures.length > 0) {
      setPhase({ kind: 'recover', plan, failures, applied: plan })
      return
    }
    recordChanges([...plan.disable, ...plan.enable])
    setHistory(h => [...h, { before: status, plan, answer: null }])
    setPhase({ kind: 'awaitAnswer', plan })
  }, [orderedMods, status, applyPlan, recordChanges])

  const answer = useCallback((bugStillPersists: boolean) => {
    if (phase.kind !== 'awaitAnswer') return
    const next = classifyAfterAnswer(status, phase.plan, bugStillPersists)
    setStatus(next)
    setHistory((h) => {
      if (!h.length) return h
      const last = { ...h[h.length - 1], answer: bugStillPersists }
      return [...h.slice(0, -1), last]
    })
    // Item 7 — if exactly one suspect remains, declare victory with a modal.
    const remainingSuspects = mods.filter(m => (next.get(m) ?? 'suspect') === 'suspect')
    if (remainingSuspects.length === 1) {
      setPhase({ kind: 'culprit', mod: remainingSuspects[0] })
      setInfo('')
      return
    }
    setPhase({ kind: 'menu' })
    setInfo(bugStillPersists ? 'cause is in the enabled half' : 'cause is in the disabled half')
  }, [phase, status, mods])

  const undo = useCallback(async () => {
    setHistory((h) => {
      if (!h.length) return h
      const last = h[h.length - 1]
      // Restore the world state by re-applying the inverse plan.
      void (async () => {
        await ModClass.disable([...last.plan.enable])
        await ModClass.enable([...last.plan.disable])
        setStatus(last.before)
      })()
      return h.slice(0, -1)
    })
    setPhase({ kind: 'menu' })
    setInfo('undid last iteration')
  }, [])

  const enableEverything = useCallback(async () => {
    const r = await ModClass.enable(mods.filter(m => m.disabled))
    setInfo(`re-enabled ${r.ok} mods${r.failed.length ? ` (${r.failed.length} failed)` : ''}`)
  }, [mods])

  const handleMenuKey = useCallback((input: string, key: { upArrow?: boolean, downArrow?: boolean, return?: boolean, escape?: boolean }) => {
    if (input === '1') {
      setPhase({ kind: 'pickTrusted' })
      return
    }
    if (input === '2') {
      setPhase({ kind: 'pickIgnored' })
      return
    }
    if (input === '3') {
      void halve()
      return
    }
    if (input === 'u') {
      void undo()
      return
    }
    if (input === 'q' || key.escape) {
      // Item 18 — confirm exit & offer to re-enable everything.
      const anyDisabled = mods.some(m => m.disabled)
      if (anyDisabled) setPhase({ kind: 'confirmExit' })
      else onDone()
      return
    }
    if (key.upArrow) {
      setActionFocus(f => ((f - 1 + ACTIONS.length) % ACTIONS.length) as 0 | 1 | 2)
      return
    }
    if (key.downArrow) {
      setActionFocus(f => ((f + 1) % ACTIONS.length) as 0 | 1 | 2)
      return
    }
    if (key.return) {
      const action = ACTIONS[actionFocus]
      if (action.key === '1') setPhase({ kind: 'pickTrusted' })
      else if (action.key === '2') setPhase({ kind: 'pickIgnored' })
      else if (action.key === '3') void halve()
    }
  }, [actionFocus, halve, undo, mods, onDone])

  useInput((input, key) => {
    if (phase.kind === 'menu') {
      handleMenuKey(input, key)
    }
    else if (phase.kind === 'awaitAnswer') {
      if (input === 'y') answer(true)
      else if (input === 'n') answer(false)
      else if (input === 'u') void undo()
      else if (input === 'q' || key.escape) setPhase({ kind: 'menu' })
    }
    else if (phase.kind === 'recover') {
      if (input === 'r') {
        void halve()
      }
      else if (input === 'a') {
        void (async () => {
          await enableEverything()
          setPhase({ kind: 'menu' })
        })()
      }
      else if (input === 'c' || key.escape) {
        setPhase({ kind: 'menu' })
      }
    }
    else if (phase.kind === 'confirmExit') {
      if (input === 'a') {
        void (async () => {
          await enableEverything()
          onDone()
        })()
      }
      else if (input === 'e') {
        onDone()
      }
      else if (input === 'c' || key.escape) {
        setPhase({ kind: 'menu' })
      }
    }
    else if (phase.kind === 'culprit') {
      // Any key dismisses the celebration. Esc/q exits the screen entirely.
      if (input === 'q' || key.escape) onDone()
      else setPhase({ kind: 'menu' })
    }
  })

  if (phase.kind === 'pickTrusted' || phase.kind === 'pickIgnored') {
    const isTrustedPick = phase.kind === 'pickTrusted'
    const titleText = isTrustedPick ? 'Pick TRUSTED mods (kept disabled)' : 'Pick IGNORED mods (kept enabled)'
    return (
      <ModSelector
        mods={mods}
        loader={loader}
        descriptions={descriptions}
        maxSize={maxSize}
        title={titleText}
        mode="pickList"
        initialSelected={mods.filter(m => getStatus(status, m) === (isTrustedPick ? 'trusted' : 'ignored'))}
        isLocked={(m) => {
          const s = getStatus(status, m)
          if (isTrustedPick && s === 'ignored') return 'already ignored'
          if (!isTrustedPick && s === 'trusted') return 'already trusted'
          return undefined
        }}
        onComplete={(picked) => {
          const next = new Map(status)
          for (const m of mods) {
            if (picked.includes(m)) next.set(m, isTrustedPick ? 'trusted' : 'ignored')
            else if (getStatus(next, m) === (isTrustedPick ? 'trusted' : 'ignored')) next.set(m, 'suspect')
          }
          setStatus(next)
          if (isTrustedPick) void ModClass.disable(picked)
          else void ModClass.enable(picked)
          recordChanges(picked)
          setPhase({ kind: 'menu' })
          setInfo(`${picked.length} mods marked ${isTrustedPick ? 'trusted' : 'ignored'}`)
        }}
        onCancel={() => setPhase({ kind: 'menu' })}
      />
    )
  }

  const logEntries: IterationEntry[] = history.map((h, i) => ({
    index      : i + 1,
    enabled    : h.plan.enabledSuspects.size,
    disabled   : h.plan.disabledSuspects.size,
    bugPersists: h.answer ?? undefined,
  }))

  // Item 8 — currently-enabled mods, sorted by most recent status change.
  // Recompute each render so a flipped mod immediately reorders.
  const orderMap = new Map(recentChanges.map((m, i) => [m, i] as const))
  const enabledList = mods
    .filter(m => m.enabled)
    .sort((a, b) => (orderMap.get(a) ?? Number.POSITIVE_INFINITY) - (orderMap.get(b) ?? Number.POSITIVE_INFINITY))

  // Item 7 — culprit-found celebration modal.
  if (phase.kind === 'culprit') {
    const sparkle = WIN_FRAMES[winFrame % WIN_FRAMES.length]
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor={t.success}
          paddingX={4}
          paddingY={1}
        >
          <Box justifyContent="center">
            <Text bold color={t.success}>
              {sparkle}
              {' '}
              CULPRIT FOUND
              {' '}
              {sparkle}
            </Text>
          </Box>
          <Box marginTop={1} justifyContent="center">
            <Text bold color={t.accent}>{phase.mod.displayName}</Text>
          </Box>
          <Box justifyContent="center">
            <Text color={t.fgMuted}>{phase.mod.fileName}</Text>
          </Box>
          {phase.mod.addon
            ?                 <Box justifyContent="center">
                <Text color={t.fgDim}>
                  {`addon #${phase.mod.addon.addonID}`}
                </Text>
              </Box>

            : null}
          <Box marginTop={1} justifyContent="center">
            <Text color={t.fgDim}>press any key to continue · q exit</Text>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold color={t.primary}>◢ Binary Search</Text>
        <Text color={t.fgMuted}>
          {'   '}
          iter #
          {history.length + 1}
        </Text>
      </Box>

      <Box marginTop={1}>
        <StatusChip label="suspect" count={counts.suspect} variant="warning" />
        <StatusChip label="trusted" count={counts.trusted} variant="success" />
        <StatusChip label="ignored" count={counts.ignored} variant="info" />
        <StatusChip label="bundles" count={bundles.length} variant="accent" />
      </Box>

      <Box marginY={1}>
        <Panel title="◳ MOD MATRIX" variant="strong" flexGrow={1}>
          <ModMatrix mods={mods} status={status} bundles={bundles} />
        </Panel>
      </Box>

      <Box flexDirection={breakpoint === 'lg' ? 'row' : 'column'}>
        <Box flexGrow={1} marginRight={breakpoint === 'lg' ? 1 : 0}>
          <Panel title={panelTitle(phase)} variant={panelVariant(phase)} flexGrow={1}>
            {renderActionPanel(phase, t, actionFocus)}
          </Panel>
        </Box>

        <Box flexGrow={1} marginRight={breakpoint === 'lg' ? 1 : 0}>
          <Panel title="◷ HISTORY" flexGrow={1}>
            <IterationLog entries={logEntries} />
          </Panel>
        </Box>

        <Box flexGrow={1}>
          <Panel title={`◐ ENABLED (${enabledList.length})`} flexGrow={1}>
            {enabledList.length === 0
              ? <Text color={t.fgMuted}>none enabled</Text>
              : enabledList.slice(0, 9).map((m, i) =>
                  <Text key={i} color={t.fgDim}>
                    {' '}
                    ·
                    {' '}
                    {m.displayName}
                  </Text>
                )}
            {enabledList.length > 9
              ?                   <Text color={t.fgMuted}>
                  {' '}
                …and
                  {' '}
                  {enabledList.length - 9}
                  {' '}
                more
                </Text>

              : null}
          </Panel>
        </Box>
      </Box>

      {info
        ?             <Text color={t.fgDim}>
            {'  '}
            {info}
          </Text>

        : null}
    </Box>
  )
}

function panelTitle(phase: Phase): string {
  if (phase.kind === 'awaitAnswer') return '◉ ACTION REQUIRED'
  if (phase.kind === 'recover') return '⚠ RECOVERY'
  if (phase.kind === 'confirmExit') return '◈ EXIT'
  return '⟁ ACTIONS'
}

function panelVariant(phase: Phase): 'default' | 'accent' | 'danger' {
  if (phase.kind === 'awaitAnswer') return 'accent'
  if (phase.kind === 'recover' || phase.kind === 'confirmExit') return 'danger'
  return 'default'
}

function renderActionPanel(
  phase: Phase,
  t: ReturnType<typeof useTheme>,
  actionFocus: 0 | 1 | 2
) {
  if (phase.kind === 'awaitAnswer') {
    return (
      <Box flexDirection="column">
        <Text color={t.fg}>Launch Minecraft with the current mod set, then answer:</Text>
        <Text color={t.fgDim}>does the bug still persist?</Text>
        <Box marginTop={1}>
          <Text color={t.danger} bold>[y] yes</Text>
          <Text>{'    '}</Text>
          <Text color={t.success} bold>[n] no</Text>
          <Text>{'    '}</Text>
          <Text color={t.fgMuted}>[u] undo  [esc] cancel</Text>
        </Box>
      </Box>
    )
  }
  if (phase.kind === 'recover') {
    return (
      <Box flexDirection="column">
        <Text color={t.danger} bold>Some files could not be renamed (game still running?):</Text>
        {phase.failures.slice(0, 5).map((f, i) =>
          <Text key={i} color={t.fgDim}>
            {' '}
            ·
            {f.mod.fileNameNoExt}
            :
            {f.error}
          </Text>
        )}
        {phase.failures.length > 5
          ? <Text color={t.fgMuted}>
              {' '}
            …and
              {phase.failures.length - 5}
              {' '}
            more
            </Text>
          : null}
        <Box marginTop={1}>
          <Text color={t.accent} bold>[r] retry</Text>
          <Text>{'   '}</Text>
          <Text color={t.success} bold>[a] abort & re-enable everything</Text>
          <Text>{'   '}</Text>
          <Text color={t.fgMuted}>[c] cancel</Text>
        </Box>
      </Box>
    )
  }
  if (phase.kind === 'confirmExit') {
    return (
      <Box flexDirection="column">
        <Text color={t.fg}>Exit Binary Search? Some mods are still disabled.</Text>
        <Box marginTop={1}>
          <Text color={t.success} bold>[a] enable all & exit</Text>
          <Text>{'   '}</Text>
          <Text color={t.warning} bold>[e] exit without changes</Text>
          <Text>{'   '}</Text>
          <Text color={t.fgMuted}>[c] cancel</Text>
        </Box>
      </Box>
    )
  }
  // Menu — actions with arrow-nav focus + numeric shortcuts.
  return (
    <Box flexDirection="column">
      {ACTIONS.map((a, i) => {
        const isFocus = i === actionFocus
        const labelColor = isFocus ? t.accent : t.fg
        // Item 4 — render the hint as a stable second line on every action
        // (just brighter when focused), so the layout stops shifting as the
        // focus moves between options.
        return (
          <Box key={a.key} flexDirection="column">
            <Box>
              <Text color={isFocus ? t.accent : t.fgMuted}>{isFocus ? '❯ ' : '  '}</Text>
              <Text bold color={labelColor}>
                [
                {a.key}
                ]
                {' '}
                {a.label}
              </Text>
            </Box>
            <Text color={isFocus ? t.fgDim : t.fgMuted}>
              {'      '}
              {a.hint}
            </Text>
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color={t.fgMuted}>↑↓ select · enter activate · 1/2/3 jump · u undo · q quit</Text>
      </Box>
    </Box>
  )
}
