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

  test('window wider than screen clamps to left edge', () => {
    expect(topRightCorner({ x: 1920, y: -400, w: 1080, h: 1920 }, 2000, 600))
      .toEqual({ x: 1920, y: -400 })
  })

  test('picks the window of the given pid, not the largest', async () => {
    const { pickWindow } = await import('../src/launcher/place-window.ts')
    const wins = [
      { hwnd: 11, pid: 111, x: 0, y: 0, w: 1920, h: 1080 },
      { hwnd: 22, pid: 222, x: 0, y: 0, w: 800, h: 600 },
    ]
    expect(pickWindow(wins, 222)).toEqual(wins[1])
    expect(pickWindow(wins, undefined)).toEqual(wins[0])
    expect(pickWindow(wins, 999)).toBeNull()
  })
})
