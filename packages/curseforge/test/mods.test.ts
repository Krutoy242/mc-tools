import { readFileSync, writeFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCachePath } from '../src/cache.js'
import { fetchMod, fetchMods, loadFromCF } from '../src/mods.js'

vi.mock('node:fs', () => ({
  mkdirSync    : vi.fn(),
  readFileSync : vi.fn(),
  writeFileSync: vi.fn(),
}))

const getModsMock = vi.fn()
vi.mock('curseforge-v2', () => {
  return {
    default: {
      CFV2Client: vi.fn(() => ({
        getMods: getModsMock,
      })),
    },
    CFV2Client: vi.fn(() => ({
      getMods: getModsMock,
    })),
  }
})

describe('fetchMods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCachePath('test-cache.json')
  })

  it('should fetch mods from CF when cache is empty', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 1, name: 'Mod 1' }],
      },
    })

    const mods = await fetchMods([1], 'fake-api-key')

    expect(mods).toHaveLength(1)
    expect(mods[0].name).toBe('Mod 1')
    expect(readFileSync).toHaveBeenCalledWith('test-cache.json', 'utf8')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [1] })
    expect(writeFileSync).toHaveBeenCalled()
  })

  it('should return mods from cache if valid', async () => {
    const cachedMod = { id: 1, name: 'Mod 1', __lastUpdated: Date.now() }
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 1: cachedMod }))

    const mods = await fetchMods([1], 'fake-api-key')

    expect(mods).toHaveLength(1)
    expect(mods[0].name).toBe('Mod 1')
    expect(getModsMock).not.toHaveBeenCalled()
  })

  it('should refetch mods from CF if cache is expired', async () => {
    const expiredMod = { id: 1, name: 'Mod 1', __lastUpdated: Date.now() - (100 * 60 * 60 * 1000) } // 100 hours ago
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 1: expiredMod }))
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 1, name: 'Mod 1 (Updated)' }],
      },
    })

    const mods = await fetchMods([1], 'fake-api-key', 96) // 96 hours timeout

    expect(mods).toHaveLength(1)
    expect(mods[0].name).toBe('Mod 1 (Updated)')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [1] })
  })

  it('should handle mixed cached and non-cached mods', async () => {
    const cachedMod = { id: 1, name: 'Mod 1', __lastUpdated: Date.now() }
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 1: cachedMod }))
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 2, name: 'Mod 2' }],
      },
    })

    const mods = await fetchMods([1, 2], 'fake-api-key')

    expect(mods).toHaveLength(2)
    expect(mods[0].name).toBe('Mod 1')
    expect(mods[1].name).toBe('Mod 2')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [2] })
  })

  it('should throw error if CF fetch fails', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({
      statusCode: 200,
      data      : {
        data: [],
      },
    })

    await expect(fetchMods([1], 'fake-api-key')).rejects.toThrow('CurseForge returned no mods for 1 IDs: 1')
  })

  it('should reuse outdated cache when CF is unreachable', async () => {
    const expired = { id: 1, name: 'Mod 1 (stale)', __lastUpdated: Date.now() - (100 * 60 * 60 * 1000) }
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 1: expired }))
    getModsMock.mockRejectedValue(new Error('read ECONNRESET'))
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    try {
      const mods = await fetchMods([1], 'fake-api-key', 96)

      expect(mods).toHaveLength(1)
      expect(mods[0].name).toBe('Mod 1 (stale)')
      // Stale entries keep their old timestamp, so the next run retries CF
      expect(writeFileSync).not.toHaveBeenCalled()
    }
    finally {
      stderrSpy.mockRestore()
    }
  })

  it('should rethrow when CF is unreachable and nothing is cached', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))
    getModsMock.mockRejectedValue(new Error('read ECONNRESET'))

    await expect(fetchMods([1], 'fake-api-key')).rejects.toThrow('read ECONNRESET')
  })

  it('should fallback to env or default cache path if override is not set', async () => {
    // @ts-expect-error - forcing undefined to test fallback
    setCachePath(undefined)

    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({ data: { data: [{ id: 1, name: 'Mod 1' }] } })

    // Test with process.env
    process.env.MCTOOLS_CF_CACHE = 'env-cache.json'
    await fetchMods([1], 'fake-api-key')
    expect(readFileSync).toHaveBeenCalledWith('env-cache.json', 'utf8')

    // Test with default
    delete process.env.MCTOOLS_CF_CACHE
    await fetchMods([1], 'fake-api-key')
    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('curseforge-mods.json'), 'utf8')
  })

  it('should log to stdout if doLogging is true', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}))
    getModsMock.mockResolvedValue({ data: { data: [] } })

    try {
      await fetchMods([], 'fake-api-key', 96, true)
      expect(stdoutSpy).toHaveBeenCalledWith('Found cached mods: 0 ')
    }
    finally {
      stdoutSpy.mockRestore()
    }
  })

  it('should handle cached mod without __lastUpdated', async () => {
    const cachedModWithoutDate = { id: 1, name: 'Mod 1' } // Missing __lastUpdated
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 1: cachedModWithoutDate }))
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 1, name: 'Mod 1 (Updated)' }],
      },
    })

    // If __lastUpdated is missing, it falls back to 0 (1970), so it should be considered expired
    const mods = await fetchMods([1], 'fake-api-key', 96)

    expect(mods).toHaveLength(1)
    expect(mods[0].name).toBe('Mod 1 (Updated)')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [1] })
  })
})

describe('fetchMod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCachePath('test-cache.json')
  })

  it('should fetch a single mod', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 42, name: 'Single Mod' }],
      },
    })

    const mod = await fetchMod(42, 'fake-api-key')

    expect(mod).toBeDefined()
    expect(mod.id).toBe(42)
    expect(mod.name).toBe('Single Mod')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [42] })
  })
})

describe('loadFromCF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array for empty input', async () => {
    const result = await loadFromCF([], 'fake-api-key')
    expect(result).toEqual([])
    expect(getModsMock).not.toHaveBeenCalled()
  })

  it('should fetch mods from CF', async () => {
    getModsMock.mockResolvedValue({
      data: {
        data: [{ id: 1, name: 'Mod 1' }],
      },
    })

    const result = await loadFromCF([1], 'fake-api-key')

    expect(result).toHaveLength(1)
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [1] })
  })

  it('should throw without retrying if CF answers 200 with no mods', async () => {
    getModsMock.mockResolvedValue({
      statusCode: 200,
      data      : { data: [] },
    })

    await expect(loadFromCF([1, 2], 'fake-api-key')).rejects.toThrow('CurseForge returned no mods for 2 IDs: 1, 2')
    expect(getModsMock).toHaveBeenCalledTimes(1)
  })

  it('should retry transient failures and succeed', async () => {
    getModsMock
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValueOnce({ statusCode: 502, message: 'Bad Gateway', data: '' })
      .mockResolvedValueOnce({ statusCode: 200, data: { data: [{ id: 1, name: 'Mod 1' }] } })

    const result = await loadFromCF([1], 'fake-api-key')

    expect(result).toHaveLength(1)
    expect(getModsMock).toHaveBeenCalledTimes(3)
  })

  it('should give up after all attempts with a shortened ID list', async () => {
    getModsMock.mockResolvedValue({ statusCode: 502, message: 'Bad Gateway', data: '' })

    const ids = Array.from({ length: 300 }, (_, i) => i + 1)
    await expect(loadFromCF(ids, 'fake-api-key')).rejects.toThrow(
      'Cant fetch 200 mods after 3 attempts (HTTP 502 Bad Gateway). IDs: 1, 2, 3, 4, 5 … and 195 more'
    )
    expect(getModsMock).toHaveBeenCalledTimes(3)
  })

  it('should split big requests into chunks', async () => {
    getModsMock.mockImplementation(async ({ modIds }: { modIds: number[] }) => ({
      statusCode: 200,
      data      : { data: modIds.map(id => ({ id, name: `Mod ${id}` })) },
    }))

    const ids = Array.from({ length: 450 }, (_, i) => i + 1)
    const result = await loadFromCF(ids, 'fake-api-key')

    expect(result).toHaveLength(450)
    expect(getModsMock).toHaveBeenCalledTimes(3)
    expect((getModsMock.mock.calls[2][0] as { modIds: number[] }).modIds).toHaveLength(50)
  })
})
