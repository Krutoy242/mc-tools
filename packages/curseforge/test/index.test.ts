import fse from 'fs-extra'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMods, setCachePath } from '../src/index.js'

vi.mock('fs-extra', () => ({
  default: {
    readJsonSync : vi.fn(),
    writeJsonSync: vi.fn(),
    mkdirpSync   : vi.fn(),
  },
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
    vi.mocked(fse.readJsonSync).mockImplementation(() => {
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
    expect(fse.readJsonSync).toHaveBeenCalledWith('test-cache.json')
    expect(getModsMock).toHaveBeenCalledWith({ modIds: [1] })
    expect(fse.writeJsonSync).toHaveBeenCalled()
  })

  it('should return mods from cache if valid', async () => {
    const cachedMod = { id: 1, name: 'Mod 1', __lastUpdated: Date.now() }
    vi.mocked(fse.readJsonSync).mockReturnValue({ 1: cachedMod })

    const mods = await fetchMods([1], 'fake-api-key')

    expect(mods).toHaveLength(1)
    expect(mods[0].name).toBe('Mod 1')
    expect(getModsMock).not.toHaveBeenCalled()
  })

  it('should refetch mods from CF if cache is expired', async () => {
    const expiredMod = { id: 1, name: 'Mod 1', __lastUpdated: Date.now() - (100 * 60 * 60 * 1000) } // 100 hours ago
    vi.mocked(fse.readJsonSync).mockReturnValue({ 1: expiredMod })
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
    vi.mocked(fse.readJsonSync).mockReturnValue({ 1: cachedMod })
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
    vi.mocked(fse.readJsonSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({
      data: {
        data: [],
      },
    })

    await expect(fetchMods([1], 'fake-api-key')).rejects.toThrow('Cant fetch mods for IDs: 1')
  })

  it('should fallback to env or default cache path if override is not set', async () => {
    // @ts-expect-error - forcing undefined to test fallback
    setCachePath(undefined)

    vi.mocked(fse.readJsonSync).mockImplementation(() => {
      throw new Error('File not found')
    })
    getModsMock.mockResolvedValue({ data: { data: [{ id: 1, name: 'Mod 1' }] } })

    // Test with process.env
    process.env.MCTOOLS_CF_CACHE = 'env-cache.json'
    await fetchMods([1], 'fake-api-key')
    expect(fse.readJsonSync).toHaveBeenCalledWith('env-cache.json')

    // Test with default
    delete process.env.MCTOOLS_CF_CACHE
    await fetchMods([1], 'fake-api-key')
    expect(fse.readJsonSync).toHaveBeenCalledWith(expect.stringContaining('curseforge-mods.json'))
  })

  it('should log to stdout if doLogging is true', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    vi.mocked(fse.readJsonSync).mockReturnValue({})
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
    vi.mocked(fse.readJsonSync).mockReturnValue({ 1: cachedModWithoutDate })
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
