# e2ee-agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-side Forge mod exposing full player control over a
localhost socket, built without Gradle.

**Architecture:** `@Mod` + `ClientProxy` (socket thread) + main-thread
dispatch via `addScheduledTask`; all `net.minecraft` touches through
`ObfuscationReflectionHelper` so `javac` only needs the Forge universal jar.

**Tech Stack:** Java 8 bytecode (`javac --release 8`), Forge 14.23.5.2860,
Cleanroom 0.6.11-alpha, raw `java.net` socket, Gson (ships with Forge).

**Spec:** `mc-tools/mod/e2ee-agent/README.md` + this file.

## Global Constraints

- No Gradle, no MCP checkout, no new npm deps.
- Java 8 bytecode; LF line endings.
- Binds `127.0.0.1` only; never commits the built jar or pack saves.
- Server side is a no-op (proxy split); `acceptableRemoteVersions = "*"`.
- Reduced-set testing only, throwaway worlds only.

## Review Focus

- Socket thread touching MC state directly instead of via scheduled task —
  expect crash or silent desync; every MC touch must hop threads.
- SRG name wrong for one side (dev vs prod) — expect NoSuchMethod; every
  name goes through `ObfuscationReflectionHelper`.
- Port already bound from a previous crashed session — expect bind failure
  in log; socket must set `SO_REUSEADDR`.
- Server side loading the client proxy — expect `NoClassDefFoundError` on a
  dedicated server; proxy split must hold.
- Chat/commands executed off-thread — expect "not on main thread" weirdness;
  route through scheduled tasks.

---

### Task 1: Skeleton that loads

**Files:**
- Create: `mc-tools/mod/e2ee-agent/src/com/e2ee/agent/AgentMod.java`
- Create: `mc-tools/mod/e2ee-agent/mcmod.info`
- Create: `mc-tools/mod/e2ee-agent/build.sh`
- Create: `mc-tools/mod/e2ee-agent/README.md`

**Interfaces:**
- Produces: `out/e2ee-agent-0.1.jar` with `com/e2ee/agent/AgentMod.class`.

- [ ] Step 1: Compile via `bash build.sh` — expect `BUILT:` + byte count.
- [ ] Step 2: Install + reduced boot, expect `E2EE-AGENT init done` in
  `logs/debug.log` and `ready` green (main menu is enough).
- [ ] Step 3: Enter world (throwaway copy), expect auto-join + `mc-cmd`
  answering.

### Task 2: Socket bridge (ping + snapshot) — DONE

Verified live: `ping` → `{"ok":true}`; `pos` matches `tp` to 0.1
(8000.5, 4.0, 8000.5). Lesson: ORH needs the DECLARING class
(Entity, not the leaf EntityPlayerSP) — leaf lookup misses inherited fields.

**Files:**
- Create: `.../agent/ClientProxy.java`, `.../agent/ServerProxy.java`,
  `.../agent/CommonProxy.java`, `.../agent/SocketServer.java`

**Interfaces:**
- Consumes: Task 1 jar pipeline.
- Produces: `127.0.0.1:6488`, `{"cmd":"ping"}` → `{"ok":true}`, and
  `{"cmd":"pos"}` → player xyz + look yaw/pitch.

- [ ] Step 1: `ping` round-trip from shell while game runs.
- [ ] Step 2: `pos` matches `tp @p ~ ~ ~` within 0.01.
- [ ] Step 3: Restart game — port rebinds cleanly, no `BindException`.

### Task 3: Intents (chat, look, keys, GUI click) — DONE

Verified live: `say` in chat; `look` (yaw/pitch in next `pos`);
`click` QUICK_MOVE dirt hotbar→main (inv before/after);
`guibtn Respawn` revives from death screen (health 0→20, `@p` matches again);
`block` reads client blocks; `screen` reports open GUI (`none` = playing);
`move` walks 19.39 blocks / 5 s (replaces key-driven input, which Cleanroom
raw input ignores — `key` dispatches but does not move, kept for menus).
`rawkey` supersedes both: tick-held `setKeyBindState` drives the real
MovementInputFromOptions (16.45 blocks / 4 s live); `restore` swaps the
key-driven input back after `move`.
`inv` lists 36 main slots. `fields` dumps runtime SRG field names.

**Files:**
- Modify: `SocketServer.java`, `ClientProxy.java`
- Create: `.../agent/Actions.java`

**Interfaces:**
- Produces: `say`, `look`, `key`, `click` commands; all run on the client
  thread.

- [ ] Step 1: `say hello-agent` appears in chat.
- [ ] Step 2: `look` rotates the player; verify via `pos` yaw/pitch delta.
- [ ] Step 3: `click` shift-clicks a chest slot into inventory; verify via
  snapshot before/after.
