import { describe, expect, it, vi } from 'vitest'
import { describeRequestError, isTransientError, retryRequest } from '../src/retry.js'

/** Socket errors carry a `code` and no `response` — exactly what axios rethrows on a reset. */
function networkError(code: string, url?: string): Error {
  return Object.assign(new Error(`read ${code}`), {
    code,
    ...url ? { config: { method: 'get', url } } : {},
  })
}

describe('isTransientError', () => {
  it('should treat socket failures as transient', () => {
    expect(isTransientError(networkError('ECONNRESET'))).toBe(true)
    expect(isTransientError(networkError('ETIMEDOUT'))).toBe(true)
  })

  it('should treat a rejected request as permanent', () => {
    expect(isTransientError(Object.assign(new Error('Bad Request'), { response: { status: 400 } }))).toBe(false)
    expect(isTransientError(new Error('boom'))).toBe(false)
  })

  it('should treat 429 and 5xx as transient', () => {
    expect(isTransientError(Object.assign(new Error('slow down'), { response: { status: 429 } }))).toBe(true)
    expect(isTransientError(Object.assign(new Error('oops'), { response: { status: 502 } }))).toBe(true)
  })
})

describe('describeRequestError', () => {
  it('should name the endpoint that died', () => {
    const message = describeRequestError(networkError('ECONNRESET', 'https://api.curseforge.com/v1/mods/1/files'))
    expect(message).toBe('read ECONNRESET (ECONNRESET, GET https://api.curseforge.com/v1/mods/1/files)')
  })
})

describe('retryRequest', () => {
  it('should return the first successful response without waiting', async () => {
    const run = vi.fn(async () => Promise.resolve({ statusCode: 200, data: 'ok' }))
    await expect(retryRequest('files', run)).resolves.toEqual({ statusCode: 200, data: 'ok' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('should retry a reset connection and succeed', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValueOnce({ statusCode: 200, data: 'ok' })

    await expect(retryRequest('files', run, 3, 1)).resolves.toEqual({ statusCode: 200, data: 'ok' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('should give up with a message naming the label and the endpoint', async () => {
    const error = networkError('ECONNRESET', 'https://api.curseforge.com/v1/mods/223008/files')
    const run = vi.fn(async () => Promise.reject(error))

    await expect(retryRequest('file list of mod 223008', run, 3, 1)).rejects.toThrow(
      /file list of mod 223008 failed after 3 attempt\(s\).+api\.curseforge\.com\/v1\/mods\/223008\/files/
    )
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('should not retry a request that can never work', async () => {
    const run = vi.fn(async () => Promise.reject(Object.assign(new Error('Forbidden'), { response: { status: 403 } })))

    await expect(retryRequest('files', run, 3, 1)).rejects.toThrow(/failed after 1 attempt\(s\)/)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('should retry a 5xx response object', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ statusCode: 502, message: 'Bad Gateway' })
      .mockResolvedValueOnce({ statusCode: 200, data: 'ok' })

    await expect(retryRequest('files', run, 3, 1)).resolves.toEqual({ statusCode: 200, data: 'ok' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('should keep the cause so callers can inspect the original error', async () => {
    const error = networkError('ECONNRESET')
    const run = vi.fn(async () => Promise.reject(error))

    await expect(retryRequest('files', run, 2, 1)).rejects.toMatchObject({ cause: error })
  })
})
