import type { Mod } from '../Mod.js'
import { Mod as ModClass } from '../Mod.js'
import { dependencyClosure, dependentsClosure } from './graph.js'

export type ActionKind = 'disable' | 'enable' | 'only' | 'except' | 'full'

export interface ActionPlan {
  /** Mods that must end up enabled (already-closed under dependencies). */
  toEnable : Mod[]
  /** Mods that must end up disabled (already-closed under dependents). */
  toDisable: Mod[]
}

export interface ConflictPlan {
  /** Mods requested both enabled (via deps) and disabled (via dependents). */
  conflict: Mod[]
}

function arr(set: Set<Mod>): Mod[] {
  return [...set]
}

/**
 * Compute the closed change-set for a single-mode action. Returned lists are
 * already closed under the relevant graph direction, so applying them never
 * triggers a surprising cascade:
 *  - `disable X` → X and every dependent go down; the rest is untouched.
 *  - `enable  X` → X and every dependency come up; the rest is untouched.
 *  - `only   X` → X+deps stay/are enabled, everything else is disabled.
 *  - `except X` → X+dependents are disabled, everything else is enabled.
 *  - `full`     → every mod is enabled.
 */
export function computeAction(allMods: Mod[], kind: ActionKind, targets: Mod[]): ActionPlan {
  switch (kind) {
    case 'full':
      return { toEnable: allMods.filter(m => m.disabled), toDisable: [] }
    case 'disable': {
      const down = dependentsClosure(targets)
      return { toEnable: [], toDisable: arr(down).filter(m => m.enabled) }
    }
    case 'enable': {
      const up = dependencyClosure(targets)
      return { toEnable: arr(up).filter(m => m.disabled), toDisable: [] }
    }
    case 'only': {
      const keep = dependencyClosure(targets)
      return {
        toEnable : arr(keep).filter(m => m.disabled),
        toDisable: allMods.filter(m => !keep.has(m) && m.enabled),
      }
    }
    case 'except': {
      const kill = dependentsClosure(targets)
      return {
        toEnable : allMods.filter(m => !kill.has(m) && m.disabled),
        toDisable: arr(kill).filter(m => m.enabled),
      }
    }
  }
}

/**
 * Combine an explicit `--disable` set with an explicit `--enable` set (the
 * `restart --disable A --enable B` form). Reports a conflict when the two
 * closures overlap — e.g. enabling B pulls in dependency A while disabling A
 * pulls in dependent B, which is a self-excluding request.
 */
export function computeCombined(disableTargets: Mod[], enableTargets: Mod[]): ActionPlan | ConflictPlan {
  const down = dependentsClosure(disableTargets)
  const up = dependencyClosure(enableTargets)
  const conflict = [...down].filter(m => up.has(m))
  if (conflict.length) return { conflict }
  return {
    toEnable : [...up].filter(m => m.disabled),
    toDisable: [...down].filter(m => m.enabled),
  }
}

export function isConflict(plan: ActionPlan | ConflictPlan): plan is ConflictPlan {
  return 'conflict' in plan
}

export interface ApplyResult {
  enabled : number
  disabled: number
  failed  : { mod: Mod, error: string }[]
}

/**
 * Apply a plan to disk. Disables first (frees jar handles) then enables.
 * In `dry` mode nothing is renamed; the caller is expected to log the intended
 * transitions with an "assumed" marker.
 */
export async function applyPlan(plan: ActionPlan, dry: boolean): Promise<ApplyResult> {
  if (dry) {
    return { enabled: plan.toEnable.length, disabled: plan.toDisable.length, failed: [] }
  }
  const dis = await ModClass.disable(plan.toDisable)
  const en = await ModClass.enable(plan.toEnable)
  return {
    enabled : en.ok,
    disabled: dis.ok,
    failed  : [...dis.failed, ...en.failed],
  }
}
