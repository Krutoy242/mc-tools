import { describe, expect, it, vi } from 'vitest'
import { isTransientNetworkError, withNetworkRetry } from '../src/git.js'

function noop() {}

/** No backoff: the retry logic is under test, not the wall clock. */
const fast = { baseDelayMs: 0 }

describe('isTransientNetworkError', () => {
  it.each([
    `fatal: unable to access 'https://github.com/CleanroomMC/HadEnoughItems.git/': Recv failure: Connection was reset`,
    `fatal: unable to access 'https://github.com/x/y.git/': Failed to connect to 127.0.0.1 port 2080`,
    `fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com`,
    'error: RPC failed; curl 56 OpenSSL SSL_read: Connection was reset, errno 10054',
    'fatal: the remote end hung up unexpectedly',
    'fatal: early EOF',
    `fatal: unable to access 'https://github.com/x/y.git/': The requested URL returned error: 502`,
  ])('retries %s', (message) => {
    expect(isTransientNetworkError(message)).toBe(true)
  })

  it.each([
    `remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found`,
    'fatal: Authentication failed',
    `fatal: couldn't find remote ref 1.12.2`,
    `fatal: destination path 'HadEnoughItems' already exists and is not an empty directory.`,
    'error: cannot lock ref',
  ])('gives up on %s', (message) => {
    expect(isTransientNetworkError(message)).toBe(false)
  })
})

describe('withNetworkRetry', () => {
  it('returns the first success without retrying', async () => {
    const run = vi.fn(async () => 'ok')
    await expect(withNetworkRetry('git fetch', noop, run, fast)).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('retries a reset connection until it succeeds', async () => {
    let calls = 0
    const beforeRetry = vi.fn(async () => {})
    const run = vi.fn(async () => {
      if (++calls < 3) throw new Error('Recv failure: Connection was reset')
      return calls
    })

    await expect(withNetworkRetry('git fetch', noop, run, { ...fast, beforeRetry })).resolves.toBe(3)
    expect(run).toHaveBeenCalledTimes(3)
    expect(beforeRetry).toHaveBeenCalledTimes(2)
  })

  it('rethrows a non-transient failure immediately', async () => {
    const run = vi.fn(async () => {
      throw new Error('fatal: repository not found')
    })
    await expect(withNetworkRetry('git clone', noop, run, fast)).rejects.toThrow('repository not found')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('gives up after a bounded number of attempts', async () => {
    const run = vi.fn(async () => {
      throw new Error('Recv failure: Connection was reset')
    })
    await expect(withNetworkRetry('git fetch', noop, run, fast)).rejects.toThrow('Connection was reset')
    expect(run).toHaveBeenCalledTimes(4)
  })
})
