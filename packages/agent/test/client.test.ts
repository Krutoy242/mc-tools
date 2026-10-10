import { afterEach, describe, expect, test } from 'vitest'

process.env.E2EE_AGENT_PORT = '6499'

const { execCmd, state } = await import('../src/index.ts')
const { createMockAgent } = await import('./mock-server.ts')

let mocks: Array<{ close: () => Promise<void> }> = []
afterEach(async () => {
  await Promise.all(mocks.map((m) => m.close()))
  mocks = []
})

describe('agent client', () => {
  test('execCmd normalizes slash and keeps shape', async () => {
    mocks.push(await createMockAgent())
    const r = await execCmd('time query daytime')
    expect(r.command).toBe('/time query daytime')
    expect(r.ok).toBe(true)
    expect(r.output).toContain('12345')
    expect(typeof r.uuid).toBe('string')
    expect(typeof r.ms).toBe('number')
  })

  test('state returns pos/screen/inv', async () => {
    mocks.push(await createMockAgent())
    const s = await state()
    expect(s.ok).toBe(true)
    expect(typeof s.pos.x).toBe('number')
    expect(typeof s.screen).toBe('string')
    expect(Array.isArray(s.inv)).toBe(true)
  })
})
