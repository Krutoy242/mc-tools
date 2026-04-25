import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from 'c12'
import { z } from 'zod'

/**
 * A mod-dependency tree. Each key is a mod name/regex; the value is either
 * a single dep, a list of deps, or a nested sub-tree for transitive deps.
 */
export interface Branch { [mod: string]: string | Branch | (string | Branch)[] }

const BranchSchema: z.ZodType<Branch> = z.lazy(() =>
  z.record(z.union([
    z.string(),
    z.array(z.union([z.string(), BranchSchema])),
    BranchSchema,
  ]))
)

export const ReducerConfigSchema = z.object({
  dependencies: BranchSchema.default({}),
  dependents  : BranchSchema.default({}),
  forks       : z.record(z.coerce.number(), z.array(z.number())).default({}),
})

export type ReducerConfig = z.infer<typeof ReducerConfigSchema>

function validate(raw: unknown, source: string): ReducerConfig {
  const res = ReducerConfigSchema.safeParse(raw ?? {})
  if (res.success) return res.data
  const issues = res.error.issues
    .map(i => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid reducer config (${source}):\n${issues}`)
}

const __dirname = dirname(fileURLToPath(import.meta.url))

type AnyConfig = Record<string, unknown>

export async function getConfig(cwd: string): Promise<ReducerConfig> {
  const defaultConfig = validate(
    (await loadConfig<AnyConfig>({ cwd: __dirname, name: 'reducer' })).config,
    'bundled default'
  )

  const merged = (await loadConfig<AnyConfig>({
    cwd,
    name: 'reducer',
    defaultConfig,
  })).config

  return validate(merged, cwd)
}
