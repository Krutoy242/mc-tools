import process from 'node:process'
import { execa } from 'execa'

export interface ScreenRect { x: number, y: number, w: number, h: number }
export interface WinRect extends ScreenRect { hwnd: number, pid: number }

/** The screen whose top edge is highest (smallest y). Null when empty. */
export function tallestTop(screens: ScreenRect[]): ScreenRect | null {
  let best: ScreenRect | null = null
  for (const s of screens) {
    if (!best || s.y < best.y || (s.y === best.y && s.x < best.x)) best = s
  }
  return best
}

/** Top-right corner of `screen` for a window of (winW, winH), clamped inside. */
export function topRightCorner(screen: ScreenRect, winW: number, winH: number): { x: number, y: number } {
  void winH
  return { x: Math.max(screen.x, screen.x + screen.w - winW), y: screen.y }
}

/**
 * Pick which window to move: the one with `pid` when given (the just-launched
 * game — never a stranger javaw), else the largest. Null when no match.
 */
export function pickWindow(wins: WinRect[], pid?: number): WinRect | null {
  if (!wins.length) return null
  if (pid !== undefined) return wins.find((w) => w.pid === pid) ?? null
  return wins.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a))
}

const PS_PREAMBLE = `
Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
public struct RECT { public int L; public int T; public int R; public int B; }
'@
Add-Type -AssemblyName System.Windows.Forms
`

const PS_PROBE = `
$screens = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  $b = $_.Bounds
  [pscustomobject]@{ x=$b.X; y=$b.Y; w=$b.Width; h=$b.Height }
}
$wins = Get-Process javaw -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
  $r = New-Object "Win32.Native+RECT"
  $ok = [Win32.Native]::GetWindowRect($_.MainWindowHandle, [ref]$r)
  if ($ok) { [pscustomobject]@{ hwnd=[int64]$_.MainWindowHandle; pid=$_.Id; x=$r.L; y=$r.T; w=$r.R-$r.L; h=$r.B-$r.T } }
}
[pscustomobject]@{ screens=@($screens); wins=@($wins) } | ConvertTo-Json -Compress -Depth 4
`

function ps(script: string, timeoutMs: number): Promise<string> {
  return execa('powershell', ['-NoProfile', '-Command', PS_PREAMBLE + '\n' + script], { timeout: timeoutMs })
    .then((r) => r.stdout)
}

async function processAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

export interface PlacedWindow { x: number, y: number, w: number, h: number, screen: ScreenRect }

export interface PlaceOptions {
  waitMs?: number
  /** PID of the just-launched game. Aborts early if it dies; selects its window. */
  pid?: number
}

/**
 * Move the game window to the top-right corner of the tallest monitor
 * (highest top edge). Non-Windows: throws. Resolves with the verified final
 * placement (rect re-read after SetWindowPos). Waits up to `waitMs` for the
 * window to appear; aborts early when `pid` dies.
 */
export async function placeGameWindow(opts: PlaceOptions = {}): Promise<PlacedWindow> {
  if (process.platform !== 'win32') throw new Error('place-window is Windows-only')
  const waitMs = opts.waitMs ?? 120_000
  const deadline = Date.now() + waitMs
  for (;;) {
    const snap = JSON.parse(await ps(PS_PROBE, 15_000)) as { screens: ScreenRect[], wins: WinRect[] }
    const screen = tallestTop(snap.screens ?? [])
    const win = pickWindow(snap.wins ?? [], opts.pid)
    if (screen && win && win.w > 0) {
      const { x, y } = topRightCorner(screen, win.w, win.h)
      const moved: boolean = JSON.parse(await ps(
        `$ok = [Win32.Native]::SetWindowPos([IntPtr]${win.hwnd}, [IntPtr]0, ${x}, ${y}, 0, 0, (0x0001 -bor 0x0004)); if ($ok) { 'true' } else { 'false' }`,
        15_000,
      ))
      if (!moved) throw new Error('SetWindowPos refused the move')
      const check = JSON.parse(await ps(PS_PROBE, 15_000)) as { wins: WinRect[] }
      const actual = pickWindow(check.wins ?? [], opts.pid ?? win.pid)
      if (!actual || actual.x !== x || actual.y !== y) {
        throw new Error(`window did not land at ${x},${y} (got ${actual ? `${actual.x},${actual.y}` : 'no window'})`)
      }
      return { x: actual.x, y: actual.y, w: actual.w, h: actual.h, screen }
    }
    if (opts.pid !== undefined && !(await processAlive(opts.pid))) {
      throw new Error(`game process ${opts.pid} died while waiting for its window`)
    }
    if (Date.now() >= deadline) {
      throw new Error(`game window did not appear within ${waitMs}ms`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}
