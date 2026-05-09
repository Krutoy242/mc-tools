import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConfig } from 'c12'
import { join } from 'pathe'
import * as YAML from 'yaml'
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

/**
 * Append a fork mapping to the user's `<mcPath>/reducer.config.yml`,
 * preserving existing top-level keys, comments, and formatting. Reads the
 * current YAML if it exists, mutates `forks[originalAddonId]` to include
 * `forkAddonId`, and writes the file back. Returns the on-disk path written.
 *
 * Implementation notes:
 *  - Uses yaml v2's `Document` API (not the JS round-trip) so existing
 *    comments stay intact and the `forks:` keys remain numeric (item 4).
 *  - When `originalName` is provided, attaches it as an inline trailing
 *    comment on the entry — matching the `74072: [1242239] # Tinker's
 *    Construct` style used in the bundled config (item 3).
 */
export async function writeForkToConfig(
  mcPath          : string,
  originalAddonId : number,
  forkAddonId     : number,
  originalName?   : string
): Promise<string> {
  const filePath = join(mcPath, 'reducer.config.yml')
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  }
  catch {
    /* file missing — start fresh */
  }

  const doc = raw ? YAML.parseDocument(raw) : new YAML.Document()
  if (!doc.contents || !YAML.isMap(doc.contents)) {
    doc.contents = new YAML.YAMLMap()
  }
  const root = doc.contents as YAML.YAMLMap

  let forksNode: YAML.YAMLMap
  const existingForks = root.get('forks', true)
  if (existingForks && YAML.isMap(existingForks)) {
    forksNode = existingForks
  }
  else {
    forksNode = new YAML.YAMLMap()
    root.set('forks', forksNode)
  }

  // Look up an existing list for this addon id; migrate any string-form key
  // to a numeric one so the output stays consistent (item 4).
  let listNode: YAML.YAMLSeq | undefined
  for (const candidate of [originalAddonId, String(originalAddonId)] as const) {
    const found = forksNode.get(candidate, true)
    if (found && YAML.isSeq(found)) {
      listNode = found
      if (typeof candidate === 'string') {
        forksNode.delete(candidate)
        forksNode.set(originalAddonId, listNode)
      }
      break
    }
  }
  if (!listNode) {
    listNode = new YAML.YAMLSeq()
    listNode.flow = true
    forksNode.set(originalAddonId, listNode)
  }

  const alreadyHas = listNode.items.some((item) => {
    const v = YAML.isScalar(item) ? item.value : item
    return v === forkAddonId
  })
  if (!alreadyHas) listNode.add(forkAddonId)

  // Attach inline trailing comment with the base mod's name (item 3). yaml
  // renders this as ` # <originalName>` after the value on the same line.
  if (originalName) {
    const pair = forksNode.items.find((p) => {
      const k = YAML.isScalar(p.key) ? p.key.value : p.key
      return Number(k) === originalAddonId
    })
    if (pair && pair.value && typeof pair.value === 'object') {
      (pair.value as YAML.Node).comment = originalName
    }
  }

  await writeFile(filePath, doc.toString(), 'utf8')
  return filePath
}
