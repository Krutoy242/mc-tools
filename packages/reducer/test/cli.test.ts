import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { getFetchInModsDir } from '../src/index'

async function cli(args: string[] = []) {
  const originalArgv = process.argv
  process.argv = ['tsx', 'src/cli.js', ...args]
  await import('../src/cli')
  process.argv = originalArgv
}

describe('cli test', () => {
  const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  afterEach(() => exitMock.mockClear())
  afterAll(() => exitMock.mockRestore())

  it('disable and enable some jars', async () => {
    await cli([
      'levels',
      'test/reduce_mods.json',
      '--mc=test',
      '--index=1',
    ])

    const fetchMods = getFetchInModsDir('test/mods')
    expect(fetchMods('*').join('\n')).toMatchInlineSnapshot(`
      "betteranimals-1.12.2-5.5.0.jar.disabled
      OptiFine_1.12.2_HD_U_G5.jar
      Sound-Physics-1.12.2-1.0.10-1.jar.disabled
      [___MixinCompat-0.8___].jar"
    `)

    await cli([
      'levels',
      'test/reduce_mods.json',
      '--mc=test',
      '--index=0',
    ])

    expect(fetchMods('*').join('\n')).toMatchInlineSnapshot(`
      "betteranimals-1.12.2-5.5.0.jar
      OptiFine_1.12.2_HD_U_G5.jar
      Sound-Physics-1.12.2-1.0.10-1.jar
      [___MixinCompat-0.8___].jar"
    `)
  })
})
