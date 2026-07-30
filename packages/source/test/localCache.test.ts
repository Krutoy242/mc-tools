import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'pathe'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifySourceFolder } from '../src/git.js'
import { resolveModId, updateIndexCache } from '../src/localCache.js'
import { sourcePath } from '../src/paths.js'

/** A `mcmod.info` templated at build time, as Cleanroom/RFG mods ship it. */
const TEMPLATED_MCMOD = JSON.stringify([{ modid: `$\{mod_id}`, name: `$\{mod_name}` }])

let root: string

async function write(relPath: string, content: string): Promise<void> {
  const file = join(root, relPath)
  await fs.mkdir(file.replace(/\/[^/]+$/, ''), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
}

beforeAll(async () => {
  root = await fs.mkdtemp(join(os.tmpdir(), 'mctools-source-'))

  // Fork whose metadata only names the mod through `gradle.properties`.
  await write('HadEnoughItems/src/main/resources/mcmod.info', TEMPLATED_MCMOD)
  await write('HadEnoughItems/gradle.properties', 'mod_version = 4.32.0\nmod_id = jei\nmod_name = Had Enough Items\n')

  // GTNH style: camelCase key, no mcmod.info at all.
  await write('Gtnh/gradle.properties', 'modId = gtnhmod\n')

  // Plain mod declaring its id directly.
  await write('Botania/mcmod.info', JSON.stringify([{ modid: 'botania' }]))

  // Scala-only sources are a valid mod, Java-free.
  for (const n of [1, 2, 3]) await write(`ScalaMod/src/main/scala/Thing${n}.scala`, 'object Thing')
  await write('EmptyRepo/README.md', '# nothing here')
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('updateIndexCache', () => {
  it('indexes ids from templated mcmod.info, gradle.properties and plain metadata', async () => {
    const cache = await updateIndexCache(root, join(root, '.index.yaml'), () => {})
    expect(cache.jei).toEqual(['HadEnoughItems'])
    expect(cache.gtnhmod).toEqual(['Gtnh'])
    expect(cache.botania).toEqual(['Botania'])
  })

  it('never indexes an unresolved placeholder', async () => {
    const cache = await updateIndexCache(root, join(root, '.index.yaml'), () => {})
    expect(Object.keys(cache).some(k => k.includes('$'))).toBe(false)
  })
})

describe('resolveModId', () => {
  it(`substitutes a $\{mod_id} placeholder from gradle.properties`, async () => {
    expect(await resolveModId(join(root, 'HadEnoughItems'))).toBe('jei')
  })

  it('reads the camelCase key too', async () => {
    expect(await resolveModId(join(root, 'Gtnh'))).toBe('gtnhmod')
  })

  it('returns null for a folder declaring nothing', async () => {
    expect(await resolveModId(join(root, 'EmptyRepo'))).toBeNull()
  })
})

describe('sourcePath', () => {
  it('spells an existing folder the way the filesystem does', async () => {
    expect(await sourcePath(root, 'hadenoughitems')).toBe(join(root, 'HadEnoughItems'))
  })

  it('falls back to the query for a folder that does not exist', async () => {
    expect(await sourcePath(root, 'Nope')).toBe(join(root, 'Nope'))
  })
})

describe('verifySourceFolder', () => {
  it('accepts a Scala-only source tree', async () => {
    expect(await verifySourceFolder(join(root, 'ScalaMod'), () => {})).toBe(true)
  })

  it('rejects a folder without sources', async () => {
    expect(await verifySourceFolder(join(root, 'EmptyRepo'), () => {})).toBe(false)
  })
})
