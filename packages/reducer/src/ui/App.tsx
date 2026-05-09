import type { ReducerCache } from '../cache.js'
import type { Mod, ModEvent } from '../Mod.js'
import type { WarningEntry } from '../ModStore.js'
import { Box, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { getConfig } from '../config.js'
import { DescriptionService } from '../descriptionService.js'
import { JarMetaLoader } from '../jarMeta.js'
import { Mod as ModClass } from '../Mod.js'
import { createWarningCache, ModStore, readModpackName } from '../ModStore.js'
import { buildTheme } from '../theme.js'
import { useAsync } from './hooks/useAsync.js'
import { ErrorBanner } from './layout/ErrorBanner.js'
import { Binary } from './screens/Binary.js'
import { FixDeps } from './screens/FixDeps.js'
import { Manual } from './screens/Manual.js'
import { Splash } from './screens/Splash.js'
import { Welcome } from './screens/Welcome.js'
import { ThemeContext } from './ThemeContext.js'

type Route = 'splash' | 'welcome' | 'manual' | 'binary' | 'fixDeps'

interface AppProps {
  mcPath: string
  cache?: ReducerCache
}

interface LoadedState {
  modpackName: string
  mods       : Mod[]
  warnings   : WarningEntry[]
}

const REFRESH_INTERVAL_MS = 5000

export function App({ mcPath, cache }: AppProps) {
  const { exit } = useApp()
  const [route, setRoute] = useState<Route>('splash')
  const [errors, setErrors] = useState<string[]>([])
  const [reloadTick, setReloadTick] = useState(0)

  // Item 5 — recreate the dedup cache on every reload. It existed to suppress
  // duplicate warnings inside a single load; preserving it across reloads
  // meant resolved missing-deps were still listed (their stale entries were
  // never evicted), so the FixDeps screen kept offering already-confirmed
  // forks. Bound to `reloadTick` so each reload starts with a clean slate.
  const warnCache = useMemo(() => createWarningCache(), [reloadTick])

  const loaded = useAsync<LoadedState>(async () => {
    const [modpackName, config] = await Promise.all([
      readModpackName(mcPath),
      getConfig(mcPath),
    ])
    const store = await ModStore.load(mcPath, config, warnCache)
    return { modpackName, mods: store.mods, warnings: warnCache.all.slice() }
  }, [mcPath, reloadTick])

  // Subscribe to mod toggle errors so we can surface them as a sticky banner.
  useEffect(() => {
    ModClass.listener = (e: ModEvent) => {
      if (e.type === 'error') {
        setErrors(prev => [...prev.slice(-9), `${e.mod.fileNameNoExt}: ${e.error}`])
      }
    }
    return () => {
      ModClass.listener = undefined
    }
  }, [])

  // Item 14 — guarantee Ctrl+C works in any state by binding it at the App
  // level. Also expose `x` as a quick way to dismiss the error banner.
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
      return
    }
    if (input === 'x' && errors.length > 0) {
      setErrors([])
    }
  })

  const theme = useMemo(() => {
    return buildTheme(loaded.status === 'ok' ? loaded.data.modpackName : 'mctools-reducer')
  }, [loaded])

  const loader = useMemo(() => new JarMetaLoader(`${mcPath}/mods`, cache, 2), [mcPath, cache])
  const descriptions = useMemo(() => new DescriptionService(`${mcPath}/mods`, cache, 2), [mcPath, cache])

  const reload = useCallback(() => setReloadTick(n => n + 1), [])

  // Item 13 — kick off a background scan over all mods as soon as the store
  // resolves. Concurrency is capped inside JarMetaLoader so this never
  // starves the UI.
  useEffect(() => {
    if (loaded.status !== 'ok') return
    loader.scanAll(loaded.data.mods)
  }, [loaded, loader])

  // Item 23 — periodically re-stat each mod so we notice files renamed or
  // removed by the user outside the program.
  useEffect(() => {
    if (loaded.status !== 'ok') return
    const mods = loaded.data.mods
    const id = setInterval(() => {
      void Promise.all(mods.map(async m => m.refresh()))
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [loaded])

  // Item 8 — compute the largest mod size once for SizeBar normalization.
  const maxSize = useMemo(() => {
    if (loaded.status !== 'ok') return 0
    return loaded.data.mods.reduce(
      (a, m) => Math.max(a, m.addon?.installedFile.fileLength ?? 0),
      0
    )
  }, [loaded])

  if (loaded.status === 'pending') {
    return (
      <ThemeContext.Provider value={theme}>
        <Box flexDirection="column" padding={1}>
          <Box>
            <Text color={theme.accent}><Spinner type="dots" /></Text>
            <Text color={theme.fg}>
              {'  '}
              scanning
              {' '}
              {mcPath}
              …
            </Text>
          </Box>
          <Text color={theme.fgMuted}>ctrl+c to quit</Text>
        </Box>
      </ThemeContext.Provider>
    )
  }
  if (loaded.status === 'error') {
    return (
      <ThemeContext.Provider value={theme}>
        <Box flexDirection="column" padding={1}>
          <Text color={theme.danger} bold>✘ failed to load modpack</Text>
          <Text color={theme.fgDim}>{loaded.error.message}</Text>
          <Text color={theme.fgMuted}>ctrl+c to quit</Text>
        </Box>
      </ThemeContext.Provider>
    )
  }

  const { modpackName, mods, warnings } = loaded.data

  return (
    <ThemeContext.Provider value={theme}>
      <Box flexDirection="column">
        {errors.length > 0 && <ErrorBanner messages={errors} />}
        {route === 'splash'
          && <Splash modpackName={modpackName} onDone={() => setRoute('welcome')} />}
        {route === 'welcome'
          && <Welcome
            modpackName={modpackName}
            mods={mods}
            warnings={warnings}
            loader={loader}
            onChoose={(c) => {
              if (c === 'manual') setRoute('manual')
              else if (c === 'binary') setRoute('binary')
              else if (c === 'fixDeps') setRoute('fixDeps')
              else exit()
            }}
          />}
        {route === 'manual'
          && <Manual
            mods={mods}
            loader={loader}
            descriptions={descriptions}
            maxSize={maxSize}
            onDone={() => {
              reload()
              setRoute('welcome')
            }}
          />}
        {route === 'binary'
          && <Binary
            mods={mods}
            loader={loader}
            descriptions={descriptions}
            maxSize={maxSize}
            onDone={() => {
              reload()
              setRoute('welcome')
            }}
          />}
        {route === 'fixDeps'
          && <FixDeps
            mcPath={mcPath}
            mods={mods}
            warnings={warnings}
            cache={cache}
            onDone={() => {
              reload()
              setRoute('welcome')
            }}
          />}
      </Box>
    </ThemeContext.Provider>
  )
}
