/**
 * Detects a git operation that spans several commits — rebase, merge,
 * cherry-pick, revert, bisect.
 *
 * Such an operation checks files out one commit at a time, so anything that
 * regenerates a tracked file from another tracked file races it: git lays down
 * `minecraftinstance.json`, the regenerator patches `manifest.json` from it
 * before git gets there, and the now-dirty working tree aborts the rebase.
 * Git announces every one of these operations with a marker inside the git
 * directory, which is the cheap way to hold off until it is over.
 */

import * as fs from 'node:fs/promises'
import * as path from 'pathe'

/** Markers git keeps in `$GIT_DIR` while an operation is unfinished. */
export const GIT_OPERATION_MARKERS = [
  'rebase-merge', // rebase (interactive and merge backend)
  'rebase-apply', // rebase --apply, and `git am`
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'BISECT_LOG',
  'sequencer', // todo list of a `rebase -i` / multi-commit cherry-pick
] as const

/**
 * Locates `$GIT_DIR` for a working tree, or `null` when there is none.
 *
 * `.git` is a plain directory in a normal clone, but a file holding a
 * `gitdir: …` pointer in a worktree or submodule checkout — this repo has both.
 */
export async function resolveGitDir(root: string): Promise<string | null> {
  const dotGit = path.join(root, '.git')
  const stat = await fs.stat(dotGit).catch(() => null)
  if (!stat) return null
  if (stat.isDirectory()) return dotGit

  const text = await fs.readFile(dotGit, 'utf-8').catch(() => null)
  // Everything after the colon is captured greedily and trimmed in code: a
  // whitespace quantifier next to the capture could exchange characters with
  // it, which is a backtracking hazard.
  const pointer = text?.match(/^gitdir:(.*)$/m)?.[1].trim()
  if (!pointer) return null
  return path.resolve(root, pointer.replace(/\\/g, '/'))
}

/**
 * Name of the in-progress operation's marker, or `null` when the tree is idle.
 *
 * The name is returned rather than a boolean so callers can say in the log
 * which operation they stepped aside for.
 */
export async function gitOperationInProgress(gitDir: string | null): Promise<string | null> {
  if (!gitDir) return null
  const found = await Promise.all(
    GIT_OPERATION_MARKERS.map(async marker =>
      fs.stat(path.join(gitDir, marker)).then(() => marker, () => null)
    )
  )
  return found.find(Boolean) ?? null
}
