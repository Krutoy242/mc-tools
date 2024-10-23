import { getLookup } from '.'

export interface MatTraits<T> { [matName: string]: { [toolPart: string]: T } }

/**
 * take traits from both configs to make table of traits
 */
export function parseTraits(
  tweakers_cfg: string,
  default_tweakers_cfg: string
) {
  const traits: MatTraits<Set<string>> = {}
  mergeChunk(default_tweakers_cfg)
  mergeChunk(tweakers_cfg, true)

  function mergeChunk(fileContent: string, rewrite = false) {
    const rgx = new RegExp(getLookup('Trait tweaks'), 'i')
    const chunk = fileContent.match(rgx)?.[0]
    if (!chunk) throw new Error('Can\'t parse tweakerconstruct.cfg')

    const added = new Set<string>()

    chunk.trim().split('\n')
      .map(l => l.trim().match(
        /^(?<mat>[^:\n]+):(?<part>[^:\n]+):(?<traits>.+)$/
      )?.groups as { mat: string, part: string, traits: string }
      )
      .filter(Boolean)
      .forEach((o) => {
        o.traits.split(',').forEach((trait) => {
          // Tweakerconstruct fully rewrite all materials traits
          if (rewrite && !added.has(o.mat)) {
            added.add(o.mat)
            traits[o.mat] = {}
          }
          ((traits[o.mat] ??= {})[o.part] ??= new Set()).add(trait)
        })
      })
  }

  return traits
}
