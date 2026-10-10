# e2ee-agent — Forge companion-mod: outside AI drives the client player

Localhost TCP bridge (line-delimited JSON). No second bot, no FML handshake
games, no per-action ZS handlers. Baritone stays as legs until direct
movement lands here.

## Layout

- `src/` — mod sources (Java 8, Forge API only; all `net.minecraft` access
  via `ObfuscationReflectionHelper` + `addScheduledTask`, never static refs —
  this keeps no-Gradle `javac` working against the obfuscated client jar).
- `build.sh` — `bash build.sh [--install]`; needs only `javac` + Prism
  libraries. No Gradle, no MCP checkout.
- `out/` — build output, not committed.
- `PLAN.md` — phased plan.

## Headless operation (unfocused window is the norm)

The control machine usually has another window focused, and vanilla reopens
the pause menu within a tick of every close while `pauseOnLostFocus` (F3+P)
is true — silently eating movement and clicks. The mod therefore enforces
`pauseOnLostFocus=false` on boot and re-asserts it every 100 client ticks
(see `NoPause.java`; `nopause` remains as manual first aid). Tests must still
treat `screen` as advisory: check it is `none` right before any
movement/click sequence.

## Dev loop (no hot-swap)

Never copy a fresh jar into `mods/` while the game runs: LaunchWrapper
lazy-loads classes, and a replaced jar reads back 0-byte class data
(`SideTransformer` AIOOBE), which used to kill the socket thread (now
guarded by `catch (Throwable)`). Order: kill → PID-zero → build+install →
start. After any `mc-cmd` world edit, let one autosave (~45 s) pass before
killing, or the edit is lost.

## Test setup (empty pack)

Reduced set, boots in ~40s instead of minutes:

```bash
pnpm reducer restart --only "cleanroom-relauncher" "Fugue" "CraftTweaker2" "ZenUtils" "ProbeZS" "e2ee-agent" --detach
pnpm reducer ready --wait
```

ProbeZS stays: it provides world auto-join + `pnpm mc-cmd`. Worlds written by
the full pack stall a reduced set at the missing-registry-entries prompt —
test on a throwaway copy (`E2EE_FORCE_WORLD`), never on the real save.

## Protocol (line JSON over 127.0.0.1:6488, one command per connection)

| request | reply |
|---|---|
| `{"cmd":"ping"}` | `{"ok":true}` |
| `{"cmd":"pos"}` | `x,y,z,yaw,pitch,health,screen` |
| `{"cmd":"use","x":..,"y":..,"z":..}` | RAW open: aim head via `lookdelta` + RMB `mousebtn` event (poll `state`) |
| `{"cmd":"guibtn","label":"Respawn"}` | clicks first button containing label (death/main-menu driver) |
| `{"cmd":"block","x":..,"y":..,"z":..}` | client-side block id |
| `{"cmd":"fields","class":".."}` | runtime (SRG) field names+types of any class |
| `{"cmd":"rawkey","code":17,"down":true}` | held raw key at LWJGL code level (tick-persistent; drives real movement) |
| `{"cmd":"lookdelta","dx":..,"dy":..}` | relative mouse look via raw Mouse accumulators |
| `{"cmd":"mousebtn","button":0,"down":true}` | raw mouse button: event injection first (`addButtonEvent`), buffer fallback |
| `{"cmd":"close"}` | close any open GuiScreen (`closeScreen` + `displayGuiScreen(null)`) |
| `{"cmd":"keybd","code":1,"down":true}` | raw Keyboard-queue event for GUI keys (Esc=1) — what `rawkey` can't reach |
| `{"cmd":"trace"}` | motion + air gap (`dy` 1 = standing) + ground id + head yaw/pitch + own `hover` raycast hit |
| `{"cmd":"tickstate"}` | tick-queue depth + fired click count + last vanilla raycast (proves press timing) |
| `{"cmd":"methods","class":".."}` | declared method names+params of any class (runtime API probe) |
| `{"cmd":"cursor","x":..,"y":..}` | bot cursor to scaled GUI coords + show (never moves the OS mouse) |
| `{"cmd":"cursordelta","dx":..,"dy":..}` | nudge bot cursor, show |
| `{"cmd":"cursoroff"}` | hide bot cursor |
| `{"cmd":"cursorhover","ticks":10}` | hold vanilla hover at virtual pos (tooltips render for real) |
| `{"cmd":"cursorclick","button":0}` | left/right click at virtual pos via real button events |
| `{"cmd":"cursorstate"}` | virtual pos vs live vanilla Mouse pos + hold depth |
| `{"cmd":"cursorslot"}` | slot the open GuiContainer sees under the Mouse (proves hover landed) |
| `{"cmd":"winv"}` | open container dump: `windowId` + all slots (`null` or `id,n,dmg`) |
| `{"cmd":"shot"}` | window screenshot: newest PNG as base64 (`file,n,png`) |
| `{"cmd":"regdump"}` | `Item.REGISTRY` keys: `count` + sorted `ids` |
| `{"cmd":"stackname","slot":0}` | player-inv slot display name: `id,name,n` |
| `{"cmd":"cmd","text":"/time query daytime"}` | server command on integrated-server thread (`ok` = vanilla success count > 0, `success`, captured `output`). Runs as console/op (server sender, world 0, player pos) — deliberately NOT the player's command: `@p` etc. resolve console-style |
| `{"cmd":"state"}` | one-tick snapshot: `pos{x,y,z,yaw,pitch,health}` + `screen` + `inv` |
| `{"cmd":"join","world":"TEST_EMPTY"}` | load world now on client thread; idempotent (`state`: `joining`/`already-loaded`/`failed`), `world` echoed back |

World source order: explicit `join` arg → `<gameDir>/e2ee-world.txt` (reducer writes it before every launch, mod consumes it after a successful join) → `E2EE_FORCE_WORLD` env. `-De2ee.world` JVM property is DEPRECATED (Prism never delivers it) and will be removed.
| `{"cmd":"nopause"}` | disable pause-on-focus-loss (the F3+P flag) for headless tests |
