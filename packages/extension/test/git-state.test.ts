import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { gitOperationInProgress, resolveGitDir } from '../src/util/git-state.js'

function workspace() {
  return mkdtempSync(join(tmpdir(), 'mctools-gitstate-'))
}

/** `resolveGitDir` answers in pathe's posix spelling. */
function posix(p: string) {
  return p.split(sep).join('/')
}

describe('resolveGitDir', () => {
  it('returns the .git folder of a normal clone', async () => {
    const root = workspace()
    mkdirSync(join(root, '.git'))
    expect(await resolveGitDir(root)).toBe(posix(join(root, '.git')))
  })

  it('follows the gitdir pointer of a worktree or submodule checkout', async () => {
    const root = workspace()
    mkdirSync(join(root, 'sub'))
    mkdirSync(join(root, '.git', 'modules', 'sub'), { recursive: true })
    writeFileSync(join(root, 'sub', '.git'), 'gitdir: ../.git/modules/sub\n')
    expect(await resolveGitDir(join(root, 'sub')))
      .toBe(posix(join(root, '.git', 'modules', 'sub')))
  })

  it('returns null outside a checkout', async () => {
    expect(await resolveGitDir(workspace())).toBeNull()
  })
})

describe('gitOperationInProgress', () => {
  it('names an interactive rebase', async () => {
    const gitDir = workspace()
    mkdirSync(join(gitDir, 'rebase-merge'))
    expect(await gitOperationInProgress(gitDir)).toBe('rebase-merge')
  })

  it('names a cherry-pick', async () => {
    const gitDir = workspace()
    writeFileSync(join(gitDir, 'CHERRY_PICK_HEAD'), 'deadbeef\n')
    expect(await gitOperationInProgress(gitDir)).toBe('CHERRY_PICK_HEAD')
  })

  it('reports nothing for an idle tree, and for no repository at all', async () => {
    const gitDir = workspace()
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/master\n')
    expect(await gitOperationInProgress(gitDir)).toBeNull()
    expect(await gitOperationInProgress(null)).toBeNull()
  })

  it('stops reporting once the operation finishes', async () => {
    const gitDir = workspace()
    mkdirSync(join(gitDir, 'rebase-apply'))
    expect(await gitOperationInProgress(gitDir)).toBe('rebase-apply')
    rmSync(join(gitDir, 'rebase-apply'), { recursive: true })
    expect(await gitOperationInProgress(gitDir)).toBeNull()
  })
})
