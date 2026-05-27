import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFile, fetchFiles } from '../src/files.js'

const getFilesMock = vi.fn()
const getModFileMock = vi.fn()

vi.mock('curseforge-v2', () => {
  return {
    default: {
      CFV2Client: vi.fn(() => ({
        getFiles  : getFilesMock,
        getModFile: getModFileMock,
      })),
    },
    CFV2Client: vi.fn(() => ({
      getFiles  : getFilesMock,
      getModFile: getModFileMock,
    })),
  }
})

describe('fetchFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array for empty input', async () => {
    const result = await fetchFiles([], 'fake-api-key')
    expect(result).toEqual([])
    expect(getFilesMock).not.toHaveBeenCalled()
  })

  it('should fetch multiple files via batch endpoint', async () => {
    getFilesMock.mockResolvedValue({
      data: {
        data: [
          { id: 101, fileName: 'file1.jar' },
          { id: 102, fileName: 'file2.jar' },
        ],
      },
    })

    const result = await fetchFiles([101, 102], 'fake-api-key')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(101)
    expect(result[1].id).toBe(102)
    expect(getFilesMock).toHaveBeenCalledWith({ fileIds: [101, 102] })
  })

  it('should return empty array if response has no data', async () => {
    getFilesMock.mockResolvedValue({ data: {} })

    const result = await fetchFiles([101], 'fake-api-key')

    expect(result).toEqual([])
  })
})

describe('fetchFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch a single file', async () => {
    getModFileMock.mockResolvedValue({
      data: {
        data: { id: 101, fileName: 'file1.jar' },
      },
    })

    const result = await fetchFile(1, 101, 'fake-api-key')

    expect(result).toBeDefined()
    expect(result?.id).toBe(101)
    expect(getModFileMock).toHaveBeenCalledWith(1, 101)
  })

  it('should return undefined if file not found', async () => {
    getModFileMock.mockResolvedValue({ data: {} })

    const result = await fetchFile(1, 999, 'fake-api-key')

    expect(result).toBeUndefined()
  })
})
