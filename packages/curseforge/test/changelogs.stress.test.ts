import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchChangelogs, fetchIntermediateFileChangelogs } from '../src/changelogs.js'
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

describe('fetchChangelogs stress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should execute 50 requests with controlled concurrency', async () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      modId : asAddonID(1),
      fileId: asFileID(1000 + i),
    }))

    let concurrentCount = 0
    let maxConcurrent = 0

    getModFileChangelogMock.mockImplementation(async () => {
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)
      await new Promise(r => setTimeout(r, 10))
      concurrentCount--
      return { data: { data: 'changelog' } }
    })

    const result = await fetchChangelogs(entries, 'fake-api-key', false, 10)

    expect(result.size).toBe(50)
    expect(getModFileChangelogMock).toHaveBeenCalledTimes(50)
    expect(maxConcurrent).toBeLessThanOrEqual(10)
  })
})

describe('fetchIntermediateFileChangelogs stress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should execute intermediate changelog requests with controlled concurrency', async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      id      : 100 + i,
      fileName: `v${i}.jar`,
      fileDate: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }))

    let concurrentCount = 0
    let maxConcurrent = 0

    getModFilesMock.mockResolvedValue({ data: { data: files } })
    getModFileChangelogMock.mockImplementation(async () => {
      concurrentCount++
      maxConcurrent = Math.max(maxConcurrent, concurrentCount)
      await new Promise(r => setTimeout(r, 10))
      concurrentCount--
      return { data: { data: 'changelog' } }
    })

    const result = await fetchIntermediateFileChangelogs(1, 100, 119, 'fake-api-key', false, undefined, 15, 5)

    expect(result.changelogs).toHaveLength(15)
    expect(getModFileChangelogMock).toHaveBeenCalledTimes(15)
    expect(maxConcurrent).toBeLessThanOrEqual(5)
  })
})
