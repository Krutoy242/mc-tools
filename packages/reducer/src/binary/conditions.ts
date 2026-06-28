import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

/**
 * Read-only view of the running test handed to each condition function. The
 * functions inspect logs (the common case) plus timing/crash flags to decide
 * whether the test has concluded and whether the bug reproduced.
 */
export interface ConditionContext {
  /** Every debug.log line captured since this test's launch. */
  debugLog       : string[]
  /** Every crafttweaker.log line captured since launch. */
  craftTweakerLog: string[]
  /** `debugLog` joined with newlines, for whole-text regex tests. */
  debugText      : string
  /** ms since launch. */
  elapsed        : number
  /** True once a crash report appeared. */
  crashed        : boolean
}

export interface Conditions {
  /** "No point watching further" — the test has produced a verdict. */
  isTestEnded: (ctx: ConditionContext) => boolean
  /** "Yes, the bug reproduced." Only trusted once {@link isTestEnded}. */
  isBugFound : (ctx: ConditionContext) => boolean
}

/** Identity helper so a `conditions.ts` author gets full type-checking. */
export function defineConditions(c: Conditions): Conditions {
  return c
}

/**
 * Load a conditions config from a `.ts`/`.mjs`/`.js` file via jiti. Accepts a
 * default export object or top-level named exports. Throws a clear error when a
 * required function is missing or not callable (the "one required field doesn't
 * validate" failure mode).
 */
export async function loadConditions(absPath: string): Promise<Conditions> {
  const jiti = createJiti(import.meta.url, { moduleCache: false })
  let mod: Record<string, unknown>
  try {
    mod = await jiti.import<Record<string, unknown>>(pathToFileURL(absPath).href)
  }
  catch (e) {
    throw new Error(`Failed to load conditions config "${absPath}": ${e instanceof Error ? e.message : String(e)}`)
  }

  const def = (mod.default ?? mod) as Partial<Conditions>
  const isTestEnded = pick(def.isTestEnded, (mod as Partial<Conditions>).isTestEnded)
  const isBugFound = pick(def.isBugFound, (mod as Partial<Conditions>).isBugFound)

  const problems: string[] = []
  if (typeof isTestEnded !== 'function') problems.push('isTestEnded (must be a function)')
  if (typeof isBugFound !== 'function') problems.push('isBugFound (must be a function)')
  if (problems.length) {
    throw new Error(`Invalid conditions config "${absPath}" — missing/invalid: ${problems.join(', ')}`)
  }

  return { isTestEnded: isTestEnded!, isBugFound: isBugFound! }
}

function pick<T>(...vals: (T | undefined)[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined) return v
  }
  return undefined
}
