/* eslint-disable no-console */
import { describe, it } from 'vitest'
import { fetchChangelogs, fetchIntermediateFileChangelogs } from '../src/changelogs.js'
import { asAddonID, asFileID } from '../src/index.js'

const CF_API_KEY = process.env.CF_API_KEY

// JEI (Just Enough Items) - popular mod with many files
const TEST_MOD_ID = 238222

describe.skipIf(!CF_API_KEY)('changelogs Integration Stress Tests', () => {
  it.skip('should measure fetchChangelogs performance for 50 requests', async () => {
    const Client = (await import('curseforge-v2')).default.CFV2Client
    const c = new Client({ apiKey: CF_API_KEY! })

    const filesResponse = await c.getModFiles({ modId: TEST_MOD_ID, pageSize: 50 })
    const files = filesResponse.data?.data ?? []
    const entries = files.slice(0, 50).map(f => ({ modId: asAddonID(TEST_MOD_ID), fileId: asFileID(f.id) }))

    const concurrencyLevels = [10, 50]
    for (const concurrency of concurrencyLevels) {
      const start = performance.now()
      const result = await fetchChangelogs(entries, CF_API_KEY!, false, concurrency)
      const duration = performance.now() - start
      const rps = entries.length / (duration / 1000)
      console.log(`Concurrency ${concurrency.toString().padStart(2)}: ${duration.toFixed(0)}ms | ${rps.toFixed(1)} req/s | fetched ${result.size}/${entries.length}`)
    }
  }, 120000)

  it.skip('should measure fetchIntermediateFileChangelogs performance', async () => {
    const Client = (await import('curseforge-v2')).default.CFV2Client
    const c = new Client({ apiKey: CF_API_KEY! })

    const response = await c.getModFiles({ modId: TEST_MOD_ID, pageSize: 50 })
    const allFiles = (response.data?.data ?? []) as Array<{ id: number, fileDate: string }>

    allFiles.sort((a, b) => new Date(a.fileDate).getTime() - new Date(b.fileDate).getTime())

    const oldFile = allFiles[0]
    const newFile = allFiles[Math.min(45, allFiles.length - 1)]

    const concurrencyLevels = [10, 50]
    for (const concurrency of concurrencyLevels) {
      const start = performance.now()
      const changelogs = await fetchIntermediateFileChangelogs(
        TEST_MOD_ID,
        oldFile.id,
        newFile.id,
        CF_API_KEY!,
        false,
        undefined,
        20,
        concurrency
      )
      const duration = performance.now() - start
      console.log(`Concurrency ${concurrency.toString().padStart(2)}: ${duration.toFixed(0)}ms | ${changelogs.changelogs.length} changelogs fetched`)
    }
  }, 120000)
})
