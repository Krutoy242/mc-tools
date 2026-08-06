// Renders assets/icon.png from the same motif as assets/icon.svg.
//
// vsce rejects SVG extension icons, and the marketplace wants at least
// 128x128. Rather than add an image dependency for one 128px square, the PNG is
// encoded here over node:zlib — the same approach `@mctools/utils` takes for
// .rcst archives.

import { Buffer } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 128
const SS = 4 // supersampling factor, for antialiased edges
const FG = [0xC5, 0xC5, 0xC5] // VS Code's default product-icon grey

/* ── geometry, in 128px units (the 16px SVG scaled by 8) ── */
const FRAME_OUTER = { x0: 16, y0: 16, x1: 112, y1: 112, r: 12 }
const FRAME_INNER = { x0: 24, y0: 24, x1: 104, y1: 104, r: 6 }
const DOTS = [
  { x0: 40, y0: 40 },
  { x0: 40, y0: 72 },
  { x0: 72, y0: 40 },
  { x0: 72, y0: 72 },
].map(d => ({ x0: d.x0, y0: d.y0, x1: d.x0 + 16, y1: d.y0 + 16, r: 2 }))

function insideRoundRect(x, y, { x0, y0, x1, y1, r }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y
  if (cx === x || cy === y) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function covered(x, y) {
  const inFrame = insideRoundRect(x, y, FRAME_OUTER) && !insideRoundRect(x, y, FRAME_INNER)
  return inFrame || DOTS.some(d => insideRoundRect(x, y, d))
}

/* ── rasterise to RGBA ── */
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let py = 0; py < SIZE; py++) {
  const rowStart = py * (SIZE * 4 + 1)
  raw[rowStart] = 0 // PNG filter type: none
  for (let px = 0; px < SIZE; px++) {
    let hits = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        if (covered(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) hits++
      }
    }
    const o = rowStart + 1 + px * 4
    raw[o] = FG[0]
    raw[o + 1] = FG[1]
    raw[o + 2] = FG[2]
    raw[o + 3] = Math.round((hits / (SS * SS)) * 255)
  }
}

/* ── PNG container ── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
ihdr[10] = 0 // deflate
ihdr[11] = 0 // adaptive filtering
ihdr[12] = 0 // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icon.png')
writeFileSync(out, png)
console.log(`[icon] wrote ${out} (${SIZE}x${SIZE}, ${png.length} bytes)`)
