import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchChangelog, fetchChangelogs, fetchIntermediateFileChangelogs } from '../src/changelogs.js'
import { asAddonID, asFileID } from '../src/index.js'

const getModFileChangelogMock = vi.fn()
const getModFilesMock = vi.fn()

vi.mock('curseforge-v2', () => {
  return {
    default: {
      CFV2Client: vi.fn(() => ({
        getModFileChangelog: getModFileChangelogMock,
        getModFiles        : getModFilesMock,
      })),
    },
    CFV2Client: vi.fn(() => ({
      getModFileChangelog: getModFileChangelogMock,
      getModFiles        : getModFilesMock,
    })),
  }
})

describe('fetchChangelogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty map for empty entries', async () => {
    const result = await fetchChangelogs([], 'fake-api-key')
    expect(result.size).toBe(0)
    expect(getModFileChangelogMock).not.toHaveBeenCalled()
  })

  it('should fetch multiple changelogs', async () => {
    getModFileChangelogMock.mockImplementation(async (_modId: number, fileId: number) => {
      return Promise.resolve({ data: { data: `<h1>Changelog ${fileId}</h1>` } })
    })

    const result = await fetchChangelogs(
      [
        { modId: asAddonID(1), fileId: asFileID(101) },
        { modId: asAddonID(1), fileId: asFileID(102) },
      ],
      'fake-api-key'
    )

    expect(result.size).toBe(2)
    expect(result.get(101)).toBe('<h1>Changelog 101</h1>')
    expect(result.get(102)).toBe('<h1>Changelog 102</h1>')
    expect(getModFileChangelogMock).toHaveBeenCalledTimes(2)
    expect(getModFileChangelogMock).toHaveBeenCalledWith(1, 101)
    expect(getModFileChangelogMock).toHaveBeenCalledWith(1, 102)
  })

  it('should skip failed changelogs silently', async () => {
    getModFileChangelogMock.mockImplementation(async (_modId: number, fileId: number) => {
      if (fileId === 101) return Promise.reject(new Error('Not found'))
      return Promise.resolve({ data: { data: '<h1>OK</h1>' } })
    })

    const result = await fetchChangelogs(
      [
        { modId: asAddonID(1), fileId: asFileID(101) },
        { modId: asAddonID(1), fileId: asFileID(102) },
      ],
      'fake-api-key'
    )

    expect(result.size).toBe(1)
    expect(result.get(102)).toBe('<h1>OK</h1>')
  })

  it('should log progress when doLogging is true', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    getModFileChangelogMock.mockResolvedValue({ data: { data: 'log' } })

    try {
      await fetchChangelogs([{ modId: asAddonID(1), fileId: asFileID(101) }], 'fake-api-key', true)
      expect(stdoutSpy).toHaveBeenCalledWith('\rFetching changelogs: 1/1')
      expect(stdoutSpy.mock.calls.some(c => typeof c[0] === 'string' && c[0].includes('\n'))).toBe(true)
    }
    finally {
      stdoutSpy.mockRestore()
    }
  })
})

describe('fetchChangelog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch a single changelog', async () => {
    getModFileChangelogMock.mockResolvedValue({ data: { data: '<p>Fixed bugs</p>' } })

    const result = await fetchChangelog({ modId: asAddonID(1), fileId: asFileID(101) }, 'fake-api-key')

    expect(result).toBe('<p>Fixed bugs</p>')
    expect(getModFileChangelogMock).toHaveBeenCalledWith(1, 101)
  })

  it('should return empty string if not found', async () => {
    getModFileChangelogMock.mockResolvedValue({ data: {} })

    const result = await fetchChangelog({ modId: asAddonID(1), fileId: asFileID(101) }, 'fake-api-key')

    expect(result).toBe('')
  })
})

describe('fetchIntermediateFileChangelogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array if no files found', async () => {
    getModFilesMock.mockResolvedValue({ data: { data: [] } })

    const result = await fetchIntermediateFileChangelogs(1, 100, 200, 'fake-api-key')

    expect(result).toEqual({ changelogs: [] })
  })

  it('should return changelogs between two file versions', async () => {
    const files = [
      { id: 100, fileName: 'v1.jar', fileDate: '2024-01-01T00:00:00Z' },
      { id: 101, fileName: 'v2.jar', fileDate: '2024-01-02T00:00:00Z' },
      { id: 102, fileName: 'v3.jar', fileDate: '2024-01-03T00:00:00Z' },
      { id: 200, fileName: 'v4.jar', fileDate: '2024-01-04T00:00:00Z' },
    ]

    getModFilesMock.mockResolvedValue({ data: { data: files } })
    getModFileChangelogMock.mockImplementation(async (_modId: number, fileId: number) => {
      const changes: Record<number, string> = {
        101: '<p>v2 changes</p>',
        102: '<p>v3 changes</p>',
        200: '<p>v4 changes</p>',
      }
      return Promise.resolve({ data: { data: changes[fileId] } })
    })

    const result = await fetchIntermediateFileChangelogs(1, 100, 200, 'fake-api-key')

    expect(result.changelogs).toHaveLength(3)
    expect(result.changelogs.find(r => r.fileId === 101)?.changelog).toBe('<p>v2 changes</p>')
    expect(result.changelogs.find(r => r.fileId === 102)?.changelog).toBe('<p>v3 changes</p>')
    expect(result.changelogs.find(r => r.fileId === 200)?.changelog).toBe('<p>v4 changes</p>')
  })

  it('should cap results to maxFiles', async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      id      : 100 + i,
      fileName: `v${i}.jar`,
      fileDate: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }))

    getModFilesMock.mockResolvedValue({ data: { data: files } })
    getModFileChangelogMock.mockResolvedValue({ data: { data: 'changelog' } })

    const result = await fetchIntermediateFileChangelogs(1, 100, 119, 'fake-api-key', false, undefined, 5)

    expect(result.changelogs.length).toBeLessThanOrEqual(5)
  })

  it('should return empty array if old or new file not found', async () => {
    const files = [
      { id: 100, fileName: 'v1.jar', fileDate: '2024-01-01T00:00:00Z' },
    ]

    getModFilesMock.mockResolvedValue({ data: { data: files } })

    const result = await fetchIntermediateFileChangelogs(1, 100, 999, 'fake-api-key')

    expect(result).toEqual({ changelogs: [] })
  })

  it('should handle pagination', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      id      : i + 1,
      fileName: `v${i}.jar`,
      fileDate: `2024-01-01T00:00:00Z`,
    }))
    const page2 = [
      { id: 51, fileName: 'v50.jar', fileDate: '2024-01-02T00:00:00Z' },
    ]

    getModFilesMock
      .mockResolvedValueOnce({ data: { data: page1, pagination: { totalCount: 51 } } })
      .mockResolvedValueOnce({ data: { data: page2 } })
      .mockResolvedValueOnce({ data: { data: [] } })

    await fetchIntermediateFileChangelogs(1, 1, 51, 'fake-api-key')

    expect(getModFilesMock).toHaveBeenCalledTimes(2)
    expect(getModFilesMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ modId: 1, index: 0, pageSize: 50 }))
    expect(getModFilesMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ modId: 1, index: 50, pageSize: 50 }))
  })
})
