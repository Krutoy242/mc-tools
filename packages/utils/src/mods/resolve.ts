/**
 * Shared, dependency-free mod-name resolution used by `@mctools/reducer` and
 * `@mctools/source`. Given a free-form query — a CurseForge addon id, an addon
 * display name, or a jar filename fragment — it ranks the installed addons so a
 * caller can pick the single best match or report ambiguity / no match.
 *
 * The matcher is intentionally type-agnostic: it only requires the three fields
 * present on every minecraftinstance addon, so each consumer can pass its own
 * (differently-typed) addon objects without converting them first.
 */

/** Minimal shape every consumer's addon already satisfies. */
export interface ResolvableAddon {
  addonID       : number | string
  name          : string
  fileNameOnDisk: string
}

/** Strip jar extensions, `.disabled` toggles and the `-patched` marker. */
export function purifyFileName(fileName: string | undefined): string {
  return (fileName ?? '').replace(/(?:-patched)?(?:\.jar)?(?:\.disabled)*$/i, '')
}

const NON_ALNUM = /[^a-z0-9]+/g

function canon(s: string): string {
  return s.toLowerCase().replace(NON_ALNUM, '')
}

export type MatchReason
  = | 'id'
    | 'name-exact'
    | 'file-exact'
    | 'name-canon'
    | 'file-canon'
    | 'name-substring'
    | 'file-substring'

export interface AddonMatch<T> {
  addon : T
  /** Higher is better. */
  score : number
  reason: MatchReason
}

/**
 * Rank `addons` against `query`, best first. Every returned entry matched by at
 * least one rule; the array is empty when nothing matched. Exact rules
 * (id / verbatim name / verbatim purified filename) outscore canonicalized and
 * substring rules so a precise query always wins over a loose one.
 */
export function matchAddons<T extends ResolvableAddon>(addons: T[], query: string): AddonMatch<T>[] {
  const raw = query.trim()
  const q = raw.toLowerCase()
  const qc = canon(raw)
  if (!q) return []

  const out: AddonMatch<T>[] = []
  for (const addon of addons) {
    const id = String(addon.addonID).toLowerCase()
    const name = addon.name.toLowerCase()
    const nameC = canon(addon.name)
    const file = purifyFileName(addon.fileNameOnDisk).toLowerCase()
    const fileC = canon(file)

    let best: AddonMatch<T> | undefined
    const consider = (score: number, reason: MatchReason) => {
      if (!best || score > best.score) best = { addon, score, reason }
    }

    if (id === q) consider(1000, 'id')
    if (name === q) consider(900, 'name-exact')
    if (file === q) consider(850, 'file-exact')
    if (qc && nameC === qc) consider(800, 'name-canon')
    if (qc && fileC === qc) consider(780, 'file-canon')
    // Substring rules score by how much of the candidate the query covers, so
    // a near-complete match beats an incidental short fragment.
    if (qc && nameC.includes(qc)) consider(200 + (qc.length / Math.max(1, nameC.length)) * 100, 'name-substring')
    if (qc && fileC.includes(qc)) consider(180 + (qc.length / Math.max(1, fileC.length)) * 100, 'file-substring')

    if (best) out.push(best)
  }

  return out.sort((a, b) => b.score - a.score)
}

export type Resolution<T>
  = | { kind: 'ok',        addon: T }
    | { kind: 'notfound',  query: string }
    | { kind: 'ambiguous', query: string, candidates: T[] }

/**
 * Collapse a ranked match list into a single decision. A unique top score wins;
 * a tie at the top is reported as ambiguous so callers can refuse to act on a
 * guess. Pass `topN` to bound how many candidates an ambiguous result lists.
 */
export function resolveAddon<T extends ResolvableAddon>(
  addons: T[],
  query : string,
  topN = 6
): Resolution<T> {
  const matches = matchAddons(addons, query)
  if (matches.length === 0) return { kind: 'notfound', query }
  const top = matches[0].score
  const tied = matches.filter(m => m.score === top)
  if (tied.length > 1) {
    return { kind: 'ambiguous', query, candidates: matches.slice(0, topN).map(m => m.addon) }
  }
  return { kind: 'ok', addon: matches[0].addon }
}
