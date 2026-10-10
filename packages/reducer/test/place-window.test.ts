import { describe, expect, test } from 'vitest'
import { tallestTop, topRightCorner } from '../src/launcher/place-window.ts'

describe('place-window geometry', () => {
  test('tallest = smallest y (highest top edge)', () => {
    const screens = [
      { x: 0, y: 0, w: 1920, h: 1080 },
      { x: 1920, y: -400, w: 1920, h: 1200 },
    ]
    expect(tallestTop(screens)).toEqual({ x: 1920, y: -400, w: 1920, h: 1200 })
  })

  test('top-right corner keeps window inside the screen', () => {
    expect(topRightCorner({ x: 1920, y: -400, w: 1920, h: 1200 }, 800, 600))
      .toEqual({ x: 1920 + 1920 - 800, y: -400 })
  })

  test('empty list returns null', () => {
    expect(tallestTop([])).toBeNull()
  })
})
