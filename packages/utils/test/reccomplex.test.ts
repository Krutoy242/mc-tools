import type { RcStructure } from '@mctools/utils/reccomplex'
import { Buffer } from 'node:buffer'
import {
  getBlock,
  index,
  LEGACY_TILE_ENTITY_IDS,
  modernEntityId,
  parseRcst,
  positionsOf,
  replaceBlock,
  serializeRcst,
  setBlock,
} from '@mctools/utils/reccomplex'
import { describe, expect, it } from 'vitest'

const W = 3
const H = 2
const L = 2
const PALETTE = ['minecraft:air', 'minecraft:stone', 'minecraft:mob_spawner']

/** Build a `.rcst` the way Recurrent Complex writes them, bit-packed variant. */
function fixture(): Buffer {
  const count = W * H * L
  const blocks = Array.from({ length: count }, (_, i) => i % 3)
  const bits = 2
  const packed = Buffer.alloc(Math.ceil((count * bits) / 8))
  blocks.forEach((v, i) => {
    for (let b = 0; b < bits; b++) {
      if ((v >> (bits - 1 - b)) & 1) {
        const bit = i * bits + b
        packed[bit >> 3] |= 1 << (7 - (bit & 7))
      }
    }
  })

  const root = {
    type : 'compound',
    name : '',
    value: {
      tileEntities: {
        type : 'list',
        value: {
          type : 'compound',
          value: [{
            id: { type: 'string', value: 'MobSpawner' },
            x : { type: 'int', value: 2 },
            y : { type: 'int', value: 0 },
            z : { type: 'int', value: 0 },
          }],
        },
      },
      entities       : { type: 'list', value: { type: 'end', value: [] } },
      blockCollection: {
        type : 'compound',
        value: {
          width   : { type: 'int', value: W },
          height  : { type: 'int', value: H },
          length  : { type: 'int', value: L },
          mapping : { type: 'list', value: { type: 'string', value: PALETTE } },
          metadata: { type: 'byteArray', value: blocks.map(() => 0) },
          blocks  : {
            type : 'compound',
            value: {
              blocksCompressed: {
                type : 'compound',
                value: {
                  data_length   : { type: 'int', value: count },
                  data_bitLength: { type: 'int', value: bits },
                  data_bytes    : { type: 'byteArray', value: Array.from(new Int8Array(packed.buffer, packed.byteOffset, packed.length)) },
                },
              },
            },
          },
        },
      },
    },
  }

  // Reuse the writer to produce the zip; parsing is what we actually assert on.
  const stub = {
    info        : { version: 3 },
    infoRaw     : Buffer.from('{"version":3}', 'utf8'),
    root,
    width       : W,
    height      : H,
    length      : L,
    palette     : PALETTE,
    blocks,
    metadata    : blocks.map(() => 0),
    tileEntities: root.value.tileEntities.value.value,
    entities    : [],
  } satisfies RcStructure
  return serializeRcst(stub)
}

describe('reccomplex', () => {
  it('parses palette, dimensions and tile entities', () => {
    const s = parseRcst(fixture())
    expect([s.width, s.height, s.length]).toEqual([W, H, L])
    expect(s.palette).toEqual(PALETTE)
    expect(s.blocks).toHaveLength(W * H * L)
    expect(s.tileEntities[0].id.value).toBe('MobSpawner')
    expect(s.info).toEqual({ version: 3 })
  })

  it('indexes blocks as x + width * (y + height * z)', () => {
    const s = parseRcst(fixture())
    expect(index(s, 2, 1, 1)).toBe(2 + W * (1 + H * 1))
    expect(getBlock(s, 2, 0, 0)).toEqual({ id: 'minecraft:mob_spawner', meta: 0 })
  })

  it('round-trips losslessly', () => {
    const before = fixture()
    const s = parseRcst(before)
    expect(serializeRcst(s).equals(before)).toBe(true)
  })

  it('survives a palette that grows past a bit boundary', () => {
    const s = parseRcst(fixture())
    for (let i = 0; i < 3; i++) setBlock(s, i, 0, 0, `mod:block_${i}`, i)
    const back = parseRcst(serializeRcst(s))
    expect(back.palette).toEqual([...PALETTE, 'mod:block_0', 'mod:block_1', 'mod:block_2'])
    expect(getBlock(back, 1, 0, 0)).toEqual({ id: 'mod:block_1', meta: 1 })
    expect(getBlock(back, 2, 1, 1)).toEqual(getBlock(s, 2, 1, 1))
  })

  it('replaces a block id in place and can rewrite its metadata', () => {
    const s = parseRcst(fixture())
    const positions = positionsOf(s, 'minecraft:stone')
    expect(replaceBlock(s, 'minecraft:stone', 'mod:lantern', (x, y) => x + y)).toBe(positions.length)
    for (const [x, y, z] of positions) expect(getBlock(s, x, y, z)).toEqual({ id: 'mod:lantern', meta: x + y })
    expect(s.palette).not.toContain('minecraft:stone')
  })

  it('empties a tile entity list without leaving a dangling element type', () => {
    const s = parseRcst(fixture())
    s.tileEntities = []
    const back = parseRcst(serializeRcst(s))
    expect(back.tileEntities).toEqual([])
    expect(back.root.value.tileEntities.value.type).toBe('end')
  })

  it('maps legacy ids', () => {
    expect(LEGACY_TILE_ENTITY_IDS.MobSpawner).toBe('minecraft:mob_spawner')
    expect(modernEntityId('Spider')).toBe('minecraft:spider')
    expect(modernEntityId('CaveSpider')).toBe('minecraft:cave_spider')
    expect(modernEntityId('mod:custom')).toBe('mod:custom')
  })
})
