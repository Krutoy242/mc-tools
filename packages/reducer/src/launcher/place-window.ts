import process from 'node:process'
import { execa } from 'execa'

export interface ScreenRect { x: number, y: number, w: number, h: number }
export interface WinRect extends ScreenRect { hwnd: number }

/** The screen whose top edge is highest (smallest y). Null when empty. */
export function tallestTop(screens: ScreenRect[]): ScreenRect | null {
  let best: ScreenRect | null = null
  for (const s of screens) {
    if (!best || s.y < best.y || (s.y === best.y && s.x < best.x)) best = s
  }
  return best
}

/** Top-right corner of `screen` for a window of (winW, winH). */
export function topRightCorner(screen: ScreenRect, winW: number, winH: number): { x: number, y: number } {
  void winH
  return { x: screen.x + screen.w - winW, y: screen.y }
}

const PS_PROBE = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$screens = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {',
  '  $b = $_.Bounds',
  '  [pscustomobject]@{ x=$b.X; y=$b.Y; w=$b.Width; h=$b.Height }',
  '}',
  '$javaw = Get-Process javaw -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {',
  '  $r = New-Object "Win32.Native+RECT"',
  '  $null = [Win32.Native]::GetWindowRect($_.MainWindowHandle, [ref]$r)',
  '  $_ | Add-Member -NotePropertyMembers @{ Hwnd=[int64]$_.MainWindowHandle; L=$r.L; T=$r.T; R=$r.R; B=$r.B } -PassThru',
  '} | Sort-Object { ($_.R-$_.L) * ($_.B-$_.T) } -Descending | Select-Object -First 1',
  '[pscustomobject]@{ screens=@($screens); win=if ($javaw) { @{ hwnd=$javaw.Hwnd; x=$javaw.L; y=$javaw.T; w=$javaw.R-$javaw.L; h=$javaw.B-$javaw.T } } else { $null } } | ConvertTo-Json -Compress -Depth 4',
].join('\n')

const PS_PREAMBLE = `
Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
public struct RECT { public int L; public int T; public int R; public int B; }
'@
`

function ps(script: string, timeoutMs: number): Promise<string> {
  return execa('powershell', ['-NoProfile', '-Command', PS_PREAMBLE + '\n' + script], { timeout: timeoutMs })
    .then((r) => r.stdout)
}

export interface PlacedWindow { x: number, y: number, w: number, h: number, screen: ScreenRect }

/**
 * Move the (largest) javaw window to the top-right corner of the tallest
 * monitor (highest top edge). Non-Windows: throws. Resolves with the final
 * placement. Waits up to `waitMs` for the window to appear.
 */
export async function placeGameWindow(opts: { waitMs?: number } = {}): Promise<PlacedWindow> {
  if (process.platform !== 'win32') throw new Error('place-window is Windows-only')
  const waitMs = opts.waitMs ?? 120_000
  const deadline = Date.now() + waitMs
  for (;;) {
    const snap = JSON.parse(await ps(PS_PROBE, 15_000)) as { screens: ScreenRect[], win: WinRect | null }
    const screen = tallestTop(snap.screens ?? [])
    if (screen && snap.win && snap.win.w > 0) {
      const { x, y } = topRightCorner(screen, snap.win.w, snap.win.h)
      await ps(
        `[Win32.Native]::SetWindowPos([IntPtr]${snap.win.hwnd}, [IntPtr]0, ${x}, ${y}, 0, 0, 0x0001 -bor 0x0004) | Out-Null`,
        15_000,
      )
      return { x, y, w: snap.win.w, h: snap.win.h, screen }
    }
    if (Date.now() >= deadline) {
      throw new Error(`game window did not appear within ${waitMs}ms`)
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}
