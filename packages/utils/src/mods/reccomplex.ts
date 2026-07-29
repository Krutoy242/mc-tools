/**
 * Read and write Recurrent Complex `.rcst` structure files.
 *
 * An `.rcst` is a ZIP holding `structure.json` (generation rules) and
 * `worldData.nbt` (gzipped NBT with the blocks, tile entities and entities).
 * Blocks are stored as a palette of ids plus a bit-packed index per position,
 * so editing a structure means touching {@link RcStructure.palette},
 * {@link RcStructure.blocks} and {@link RcStructure.metadata} together.
 */

import { Buffer } from 'node:buffer'
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateRawSync, gunzipSync, gzipSync, inflateRawSync } from 'node:zlib'
import nbt from 'prismarine-nbt'

/** A prismarine-nbt tag: `{ type: 'string', value: 'minecraft:stone' }`. */
export interface NbtTag<T = any> { type: string, value: T }
/** The `value` of a prismarine-nbt compound tag — a plain map of named tags. */
export type NbtCompound = Record<string, NbtTag>
/** A prismarine-nbt list tag; `value.type` is `end` while the list is empty. */
export type NbtList<T> = NbtTag<{ type: string, value: T[] }>

interface BlocksCompressed {
  data_length    : NbtTag<number>
  data_bitLength?: NbtTag<number>
  data_bytes     : NbtTag<number[]>
}

interface BlockCollection {
  width   : NbtTag<number>
  height  : NbtTag<number>
  length  : NbtTag<number>
  mapping : NbtList<string>
  metadata: NbtTag<number[]>
  blocks: NbtTag<{
    blocksCompressed?: NbtTag<BlocksCompressed>
    blockBytes?      : NbtTag<number[]>
  }>
}

/** Root compound of `worldData.nbt`. */
export interface RcWorldData {
  type : string
  name?: string
  value: {
    blockCollection: NbtTag<BlockCollection>
    tileEntities   : NbtList<NbtCompound>
    entities?      : NbtList<NbtCompound>
  }
}

export interface RcStructure {
  /** Parsed `structure.json`: transformers, generation info, metadata. */
  info        : unknown
  /** Original `structure.json` bytes, reused verbatim while {@link RcStructure.info} is untouched. */
  infoRaw     : Buffer
  /** Raw prismarine-nbt root of `worldData.nbt`, for anything not exposed here. */
  root        : RcWorldData
  width       : number
  height      : number
  length      : number
  /** Block-id palette. {@link RcStructure.blocks} holds indices into it. */
  palette     : string[]
  /** Palette index per position, `width * height * length` entries. */
  blocks      : number[]
  /** Block metadata (0-15) per position, same layout as {@link RcStructure.blocks}. */
  metadata    : number[]
  tileEntities: NbtCompound[]
  entities    : NbtCompound[]
}

// ---------------------------------------------------------------------------
// Legacy id tables
// ---------------------------------------------------------------------------

/**
 * Tile entity ids as written before MC 1.11, mapped to their modern name.
 *
 * The registry lookup is case-insensitive, so only the entries whose *word*
 * changed actually fail to load (`MobSpawner`, `RecordPlayer`, `Trap`,
 * `Cauldron`, `FlowerPot`, …); the rest are harmless but still worth fixing.
 * Structures are read straight from NBT, bypassing the vanilla DataFixer, so
 * nothing renames them at runtime.
 */
export const LEGACY_TILE_ENTITY_IDS: Readonly<Record<string, string>> = {
  Airportal   : 'minecraft:end_portal',
  Banner      : 'minecraft:banner',
  Beacon      : 'minecraft:beacon',
  Cauldron    : 'minecraft:brewing_stand',
  Chest       : 'minecraft:chest',
  Comparator  : 'minecraft:comparator',
  Control     : 'minecraft:command_block',
  DLDetector  : 'minecraft:daylight_detector',
  Dropper     : 'minecraft:dropper',
  EnchantTable: 'minecraft:enchanting_table',
  EndGateway  : 'minecraft:end_gateway',
  EnderChest  : 'minecraft:ender_chest',
  FlowerPot   : 'minecraft:flower_pot',
  Furnace     : 'minecraft:furnace',
  Hopper      : 'minecraft:hopper',
  MobSpawner  : 'minecraft:mob_spawner',
  Music       : 'minecraft:noteblock',
  Piston      : 'minecraft:piston',
  RecordPlayer: 'minecraft:jukebox',
  Sign        : 'minecraft:sign',
  Skull       : 'minecraft:skull',
  Structure   : 'minecraft:structure_block',
  Trap        : 'minecraft:dispenser',
}

/**
 * Entity names as written before MC 1.11, mapped to their modern id.
 *
 * Mostly needed inside mob spawners: 1.12 ignores the old `EntityId` key and
 * reads `SpawnData.id` instead, silently spawning pigs when it is missing.
 * Covers the vanilla names whose id is not just the lower-cased original.
 */
export const LEGACY_ENTITY_IDS: Readonly<Record<string, string>> = {
  CaveSpider          : 'minecraft:cave_spider',
  EntityHorse         : 'minecraft:horse',
  LavaSlime           : 'minecraft:magma_cube',
  MushroomCow         : 'minecraft:mooshroom',
  Ozelot              : 'minecraft:ocelot',
  PigZombie           : 'minecraft:zombie_pigman',
  SnowMan             : 'minecraft:snowman',
  VillagerGolem       : 'minecraft:villager_golem',
  WitherBoss          : 'minecraft:wither',
  PrimedTnt           : 'minecraft:tnt',
  FallingSand         : 'minecraft:falling_block',
  MinecartRideable    : 'minecraft:minecart',
  MinecartChest       : 'minecraft:chest_minecart',
  MinecartFurnace     : 'minecraft:furnace_minecart',
  MinecartHopper      : 'minecraft:hopper_minecart',
  MinecartTNT         : 'minecraft:tnt_minecart',
  MinecartSpawner     : 'minecraft:spawner_minecart',
  MinecartCommandBlock: 'minecraft:commandblock_minecart',
  ThrownEgg           : 'minecraft:egg',
  ThrownEnderpearl    : 'minecraft:ender_pearl',
  ThrownExpBottle     : 'minecraft:xp_bottle',
  ThrownPotion        : 'minecraft:potion',
  XPOrb               : 'minecraft:xp_orb',
  LeashKnot           : 'minecraft:leash_knot',
  ItemFrame           : 'minecraft:item_frame',
  EyeOfEnderSignal    : 'minecraft:eye_of_ender_signal',
  WitherSkull         : 'minecraft:wither_skull',
  SmallFireball       : 'minecraft:small_fireball',
  Fireball            : 'minecraft:fireball',
}

/** Modern id for a pre-1.11 entity name (`Spider` -> `minecraft:spider`). */
export function modernEntityId(name: string): string {
  if (name.includes(':')) return name
  return LEGACY_ENTITY_IDS[name] ?? `minecraft:${name.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Block access
// ---------------------------------------------------------------------------

/** Position -> array offset. RC stores blocks in `x + width * (y + height * z)` order. */
export function index(s: RcStructure, x: number, y: number, z: number): number {
  return x + s.width * (y + s.height * z)
}

export function inside(s: RcStructure, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < s.width && y < s.height && z < s.length
}

export function getBlock(s: RcStructure, x: number, y: number, z: number): { id: string, meta: number } {
  const i = index(s, x, y, z)
  return { id: s.palette[s.blocks[i]], meta: s.metadata[i] }
}

export function setBlock(s: RcStructure, x: number, y: number, z: number, id: string, meta = 0): void {
  const i = index(s, x, y, z)
  s.blocks[i] = paletteIndex(s, id)
  s.metadata[i] = meta
}

/** Palette slot for `id`, appending a new one if absent. */
export function paletteIndex(s: RcStructure, id: string): number {
  const i = s.palette.indexOf(id)
  return i >= 0 ? i : s.palette.push(id) - 1
}

/** Every `[x, y, z]` holding `id`. */
export function positionsOf(s: RcStructure, id: string): [number, number, number][] {
  const target = s.palette.indexOf(id)
  const out: [number, number, number][] = []
  if (target < 0) return out
  for (let i = 0; i < s.blocks.length; i++) {
    if (s.blocks[i] !== target) continue
    const x = i % s.width
    const y = Math.floor(i / s.width) % s.height
    out.push([x, y, Math.floor(i / (s.width * s.height))])
  }
  return out
}

/**
 * Swap every occurrence of one block id for another, optionally recomputing
 * metadata per position. Renames the palette entry in place, so it is cheap
 * even on large structures.
 */
export function replaceBlock(
  s: RcStructure,
  from: string,
  to: string,
  meta?: number | ((x: number, y: number, z: number) => number)
): number {
  const i = s.palette.indexOf(from)
  if (i < 0) return 0
  const positions = positionsOf(s, from)
  if (meta !== undefined) {
    for (const [x, y, z] of positions)
      s.metadata[index(s, x, y, z)] = typeof meta === 'function' ? meta(x, y, z) : meta
  }
  s.palette[i] = to
  return positions.length
}

/** Tile entity position, present on every RC tile entity as `x`/`y`/`z`. */
export function tilePos(te: NbtCompound): [number, number, number] {
  const num = (tag: NbtTag) => Number(tag.value)
  return [num(te.x), num(te.y), num(te.z)]
}

// ---------------------------------------------------------------------------
// Parsing / serialization
// ---------------------------------------------------------------------------

/** Bits per palette index, matching RC's own `data_bitLength`: 0 for a single-entry palette. */
function bitsFor(paletteSize: number): number {
  return 32 - Math.clz32(paletteSize - 1)
}

function unpack(raw: Buffer, count: number, bits: number): number[] {
  const out: number[] = Array.from<number>({ length: count })
  for (let i = 0; i < count; i++) {
    let v = 0
    for (let b = 0; b < bits; b++) {
      const bit = i * bits + b
      v = (v << 1) | ((raw[bit >> 3] >> (7 - (bit & 7))) & 1)
    }
    out[i] = v
  }
  return out
}

function pack(values: number[], bits: number): Buffer {
  const raw = Buffer.alloc(Math.ceil((values.length * bits) / 8))
  for (let i = 0; i < values.length; i++) {
    for (let b = 0; b < bits; b++) {
      if ((values[i] >> (bits - 1 - b)) & 1) {
        const bit = i * bits + b
        raw[bit >> 3] |= 1 << (7 - (bit & 7))
      }
    }
  }
  return raw
}

export function parseRcst(zip: Buffer): RcStructure {
  const files = unzip(zip)
  const root = nbt.parseUncompressed(gunzipSync(files.get('worldData.nbt')!)) as unknown as RcWorldData
  const bc = root.value.blockCollection.value
  const palette = bc.mapping.value.value
  const compressed = bc.blocks.value.blocksCompressed?.value

  // Two on-disk variants: bit-packed (`blocksCompressed`) or one byte per block.
  const blocks = compressed
    ? unpack(
        Buffer.from(Int8Array.from(compressed.data_bytes.value).buffer),
        compressed.data_length.value,
        compressed.data_bitLength?.value ?? bitsFor(palette.length)
      )
    : bc.blocks.value.blockBytes!.value.map(b => b & 0xFF)

  const infoRaw = files.get('structure.json')!
  return {
    info        : JSON.parse(infoRaw.toString('utf8')) as unknown,
    infoRaw,
    root,
    width       : bc.width.value,
    height      : bc.height.value,
    length      : bc.length.value,
    palette,
    blocks,
    metadata    : bc.metadata.value,
    tileEntities: root.value.tileEntities.value.value,
    entities    : root.value.entities?.value.value ?? [],
  }
}

export function serializeRcst(s: RcStructure): Buffer {
  const root = s.root
  const bc = root.value.blockCollection.value
  bc.mapping.value.value = s.palette
  bc.metadata.value = s.metadata

  const compressed = bc.blocks.value.blocksCompressed?.value
  if (compressed) {
    const bits = bitsFor(s.palette.length)
    const packed = pack(s.blocks, bits)
    compressed.data_length.value = s.blocks.length
    if (compressed.data_bitLength) compressed.data_bitLength.value = bits
    compressed.data_bytes.value = Array.from(new Int8Array(packed.buffer, packed.byteOffset, packed.length))
  }
  else {
    bc.blocks.value.blockBytes!.value = s.blocks.map(b => (b << 24) >> 24)
  }

  setList(root.value.tileEntities, s.tileEntities)
  if (root.value.entities) setList(root.value.entities, s.entities)

  // Keep the original bytes unless `info` was actually edited, so untouched
  // structures round-trip byte for byte instead of picking up JS JSON quirks.
  const edited = JSON.stringify(s.info) !== JSON.stringify(JSON.parse(s.infoRaw.toString('utf8')))
  return makeZip([
    ['structure.json', edited ? Buffer.from(JSON.stringify(s.info), 'utf8') : s.infoRaw],
    ['worldData.nbt', gzipSync(nbt.writeUncompressed(root as never))],
  ])
}

/** An emptied NBT list must switch its element type to `end`, or MC rejects it. */
function setList(tag: NbtList<NbtCompound>, items: NbtCompound[]): void {
  tag.value.value = items
  tag.value.type = items.length ? 'compound' : 'end'
}

export function readRcst(file: string): RcStructure {
  return parseRcst(readFileSync(file))
}

export function writeRcst(file: string, s: RcStructure): void {
  writeFileSync(file, serializeRcst(s))
}

// ---------------------------------------------------------------------------
// Minimal ZIP (store/deflate, no extras) — avoids pulling in a zip dependency
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function unzip(zip: Buffer): Map<string, Buffer> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06]))
  if (eocd < 0) throw new Error('Not a zip file: no end-of-central-directory record')
  const out = new Map<string, Buffer>()
  let p = zip.readUInt32LE(eocd + 16)
  for (let i = 0, n = zip.readUInt16LE(eocd + 10); i < n; i++) {
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen)
    const local = zip.readUInt32LE(p + 42)
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const raw = zip.subarray(dataAt, dataAt + size)
    out.set(name, method === 0 ? raw : inflateRawSync(raw))
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32)
  }
  return out
}

function makeZip(files: [string, Buffer][]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = deflateRawSync(content, { level: 9 })
    const crc = crc32(content)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034B50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)
    locals.push(local, data)

    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014B50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(8, 10) // deflate
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(content.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)
    central.push(cd)

    offset += local.length + data.length
  }

  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054B50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, eocd])
}
