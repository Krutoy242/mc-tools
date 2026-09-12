import type { McToolsConfig } from '../../core/config.js'
import type { Logger } from '../../core/logger.js'
import type { GitStaging } from './git.js'
import type { InstanceCache, ModTrackerState } from './state.js'
import { modListDiff } from '@mctools/curseforge'
import { debounce } from 'perfect-debounce'
import { gitOperationInProgress } from '../../util/git-state.js'
import { errorMessage } from '../../util/helpers.js'
import { updateManifest } from './manifest.js'
import { headInstance, syncHeadInstance } from './state.js'

/** Collapses the burst of writes a mod update makes to the instance file. */
const DEBOUNCE_MS = 1000

/** How often to re-check whether the git operation we stepped aside for ended. */
const GIT_POLL_MS = 2000

export interface ManifestSyncDeps {
  root    : string
  mciPath : string
  /** `$GIT_DIR` of the workspace, or `null` when it is not a git checkout. */
  gitDir  : string | null
  state   : ModTrackerState
  mciCache: InstanceCache
  git     : GitStaging
  config  : McToolsConfig
  logger  : Logger
  /** Called after a sync that actually rewrote the manifest. */
  onWrite : () => void
}

export interface ManifestSync {
  /** Requests a sync; debounced, and deferred while git is mid-operation. */
  queue  : () => void
  dispose: () => void
}

/**
 * Keeps `manifest.json` in step with `minecraftinstance.json`, except while git
 * owns the working tree.
 *
 * A rebase checks the two files out one after the other, so a sync that fires
 * between them patches the old manifest with the new instance and leaves the
 * tree dirty — which aborts the rebase. So the sync stands down for as long as
 * a git operation is in progress and retries once it is over, by which point
 * both files come from the same commit and the write is a no-op.
 */
export function createManifestSync(deps: ManifestSyncDeps): ManifestSync {
  const { root, mciPath, state, mciCache, git, config, logger } = deps
  let disposed = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined

  function schedulePoll() {
    if (disposed || pollTimer) return
    pollTimer = setTimeout(() => {
      pollTimer = undefined
      queue()
    }, GIT_POLL_MS)
    pollTimer.unref?.()
  }

  const run = async () => {
    if (disposed || !config.manifest.autoUpdate) return

    const operation = await gitOperationInProgress(deps.gitDir)
    if (operation) {
      logger.info(`Manifest auto-update deferred: git ${operation} in progress`)
      schedulePoll()
      return
    }

    const fresh = await mciCache.read()
    await syncHeadInstance(state, git, mciPath)
    const old = headInstance(state, fresh)
    const diff = modListDiff(fresh, old)
    logger.info(`Manifest auto-update: +${diff.added?.length ?? 0} / -${diff.removed?.length ?? 0} / ~${diff.updated?.length ?? 0}`)

    if (await updateManifest(root, fresh, old, config.manifest.postfix, config.manifest, logger)) {
      deps.onWrite()
    }
  }

  const debounced = debounce(run, DEBOUNCE_MS, { trailing: true })

  function queue() {
    debounced().catch(err => logger.error(`Manifest sync failed: ${errorMessage(err)}`))
  }

  return {
    queue,
    dispose: () => {
      disposed = true
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = undefined
    },
  }
}
