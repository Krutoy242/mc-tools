import { setTimeout as delay } from 'node:timers/promises'

/** Attempts per request before giving up. CF sporadically resets connections and answers 5xx. */
const ATTEMPTS = 3

/** Base backoff between attempts, doubled each retry. */
const RETRY_DELAY_MS = 500

/**
 * Transport failures worth another attempt — the connection died, the request
 * itself was fine. A proxy in front of the API turns any hiccup into one of these.
 */
const TRANSIENT_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_NETWORK',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

interface RequestErrorLike {
  code?    : string
  config?  : { method?: string, url?: string }
  message? : string
  response?: { status?: number }
}

/** `curseforge-v2` turns HTTP errors into a response object, so anything thrown here is transport-level. */
export function isTransientError(error: unknown): boolean {
  const e = error as RequestErrorLike
  if (e?.response?.status !== undefined) return isRetryableStatus(e.response.status)
  return typeof e?.code === 'string' && TRANSIENT_CODES.has(e.code)
}

/** 429 and 5xx are the server asking to come back later; 4xx means the request will never work. */
export function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500)
}

/** `read ECONNRESET` names no endpoint — always say which URL died. */
export function describeRequestError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const e = error as Error & RequestErrorLike
  const parts: string[] = []
  if (e.code) parts.push(e.code)
  if (e.response?.status) parts.push(`HTTP ${e.response.status}`)
  if (e.config?.url) parts.push(`${(e.config.method ?? 'get').toUpperCase()} ${e.config.url}`)

  return parts.length ? `${e.message} (${parts.join(', ')})` : e.message
}

/**
 * Run one CurseForge request, retrying transient failures with exponential backoff.
 *
 * Both failure modes are covered: a thrown transport error, and the `{ statusCode }`
 * object the client returns instead of throwing for HTTP errors. On exhaustion it
 * throws an error naming `label`, the endpoint and the reason — a bare
 * `read ECONNRESET` bubbling up from a socket says nothing about what was lost.
 */
export async function retryRequest<T extends { message?: string, statusCode?: number }>(
  label: string,
  run: () => Promise<T>,
  attempts = ATTEMPTS,
  baseDelayMs = RETRY_DELAY_MS
): Promise<T> {
  let lastError: unknown
  let reason = 'unknown error'
  let made = 0

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await delay(baseDelayMs * 2 ** (attempt - 2))
    made = attempt

    let response: T
    try {
      response = await run()
    }
    catch (error) {
      lastError = error
      reason = describeRequestError(error)
      // A malformed request or a bad key fails identically forever — don't wait three times to learn that.
      if (!isTransientError(error)) break
      continue
    }

    if (!isRetryableStatus(response.statusCode)) return response

    lastError = undefined
    reason = `HTTP ${response.statusCode}${response.message ? ` ${response.message}` : ''}`
  }

  throw new Error(`${label} failed after ${made} attempt(s): ${reason}`, { cause: lastError })
}
