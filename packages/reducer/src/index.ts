import process from 'node:process'
import { render } from 'ink'
import React from 'react'
import { createReducerCache } from './cache.js'
import { App } from './ui/App.js'

export async function main(mcPath: string) {
  const cache = createReducerCache(mcPath)
  const { waitUntilExit } = render(React.createElement(App, { mcPath, cache }), {
    exitOnCtrlC: true,
  })
  try {
    await waitUntilExit()
  }
  catch { /* swallow exit-via-ctrl-c rejection */ }
  // Ensure terminal cursor is restored even when Ink exits asynchronously.
  process.stdout.write('\n')
}
