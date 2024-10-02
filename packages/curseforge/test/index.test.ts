import { expect, it } from 'vitest'

import { fetchMods } from '../src'

it('fetchMods error without apikey', async () => {
  expect(fetchMods([59751], '0')).rejects.toThrow('Cant fetch mods for IDs: 59751')
})
