import { useEffect, useState } from 'react'

export type AsyncState<T>
  = | { status: 'pending' }
    | { status: 'ok',    data: T }
    | { status: 'error', error: Error }

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'pending' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'pending' })
    fn().then(
      (data) => { if (!cancelled) setState({ status: 'ok', data }) },
      (err: unknown) => {
        if (!cancelled)
          setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      }
    )
    return () => {
      cancelled = true
    }
  }, deps)

  return state
}
