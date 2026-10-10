package com.e2ee.agent;

import java.io.File;
import java.lang.reflect.Method;

import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.fml.common.Loader;
import net.minecraftforge.fml.common.LoaderState;
import net.minecraftforge.fml.common.ObfuscationReflectionHelper;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

// Boot-time world auto-join, owned by the mod. Triggered two ways:
// explicit socket `join` or the first menu screen (covers GUI launches).
// World resolution: join arg, then <gameDir>/e2ee-world.txt, then
// E2EE_FORCE_WORLD env. (-De2ee.world system property still read first
// but is DEPRECATED: Prism never delivers it — OverrideJavaArgs=false
// ignores JvmArgs and the launcher rewrites instance.cfg at boot.
// Path forward is socket + file only.)
//
// State machine: IDLE -> JOINING -> LOADED, or FAILED (retryable).
// join is idempotent: LOADED answers already-loaded, JOINING answers
// joining, neither relaunching. The world file is consumed (deleted)
// on the JOINING -> LOADED transition so a stale file can never
// hijack a later boot.
final class AutoJoin {
    private static final int ST_IDLE = 0;
    private static final int ST_JOINING = 1;
    private static final int ST_LOADED = 2;
    private static final int ST_FAILED = 3;

    private static volatile int state = ST_IDLE;
    private static volatile String stateErr = null;
    private static volatile String targetWorld = null;

    static String stateName() {
        switch (state) {
            case ST_JOINING: return "joining";
            case ST_LOADED: return "loaded";
            case ST_FAILED: return "failed";
            default: return "idle";
        }
    }

    @SubscribeEvent
    public void onGui(GuiOpenEvent e) {
        if (state == ST_JOINING || state == ST_LOADED) {
            return;
        }
        Object gui;
        try {
            // Reflective: the return type is an obfuscated MC class that
            // javac cannot resolve; the Forge method name itself is stable.
            gui = e.getClass().getMethod("getGui").invoke(e);
        } catch (Exception ex) {
            return;
        }
        if (gui == null) {
            return;
        }
        String world = joinFolder();
        if (world == null) {
            return;
        }
        Result r = tryJoin(world);
        if (!r.ok) {
            AgentMod.LOG.warn("E2EE-AGENT menu join deferred (" + r.err + ")");
        }
    }

    @SubscribeEvent
    public void onTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.START || state != ST_JOINING) {
            return;
        }
        try {
            Object mc = Mc.minecraft();
            Object cur = ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"),
                mc, "field_71441_e");
            if (cur != null) {
                state = ST_LOADED;
                AgentMod.LOG.info("E2EE-AGENT world loaded: " + targetWorld);
                consumeWorldFile();
            }
        } catch (Exception ex) {
            AgentMod.LOG.warn("E2EE-AGENT load watch failed: " + ex);
        }
    }

    static final class Result {
        final boolean ok;
        final String state;
        final String err;

        Result(boolean ok, String state, String err) {
            this.ok = ok;
            this.state = state;
            this.err = err;
        }
    }

    // Resolve the world: explicit arg, -De2ee.world (deprecated, see
    // class note), E2EE_FORCE_WORLD env, reducer-written e2ee-world.txt.
    // The winning source is logged (debug) so a wrong world is traceable.
    static String joinFolder() {
        String world = System.getProperty("e2ee.world");
        if (world != null && !world.trim().isEmpty()) {
            AgentMod.LOG.debug("E2EE-AGENT join source: -De2ee.world (deprecated)");
            return world.trim();
        }
        world = System.getenv("E2EE_FORCE_WORLD");
        if (world != null && !world.trim().isEmpty()) {
            AgentMod.LOG.debug("E2EE-AGENT join source: E2EE_FORCE_WORLD env");
            return world.trim();
        }
        try {
            Object mc = Mc.minecraft();
            File dir = (File) ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"),
                mc, "field_71412_D");
            File f = new File(dir, "e2ee-world.txt");
            if (!f.isFile()) {
                AgentMod.LOG.debug("E2EE-AGENT join source: none");
                return null;
            }
            java.util.Scanner sc = new java.util.Scanner(f, "UTF-8");
            String line = sc.hasNextLine() ? sc.nextLine().trim() : "";
            sc.close();
            if (line.isEmpty()) {
                AgentMod.LOG.debug("E2EE-AGENT join source: none (empty file)");
                return null;
            }
            AgentMod.LOG.debug("E2EE-AGENT join source: e2ee-world.txt");
            return line;
        } catch (Exception e) {
            AgentMod.LOG.warn("E2EE-AGENT world file unreadable: " + e);
            return null;
        }
    }

    // Load folderName now (caller must be on the client thread: Mc.sync or
    // a GUI event). Idempotent: already-loaded / joining answer ok without
    // relaunching; FAILED is retryable.
    static synchronized Result tryJoin(String folderName) {
        if (state == ST_LOADED) {
            return new Result(true, "already-loaded", null);
        }
        if (state == ST_JOINING) {
            return new Result(true, "joining", null);
        }
        if (!Loader.instance().hasReachedState(LoaderState.AVAILABLE)) {
            return new Result(false, "idle", "mods not ready");
        }
        try {
            Object mc = Mc.minecraft();
            Object cur = ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"),
                mc, "field_71441_e");
            if (cur != null) {
                state = ST_LOADED;
                targetWorld = folderName;
                consumeWorldFile();
                return new Result(true, "already-loaded", null);
            }
            // launchIntegratedServer, known SRG name first (stable_39),
            // shape scan (String, String, *) as fallback.
            Method target = null;
            try {
                target = mc.getClass().getMethod("func_71371_a", String.class,
                    String.class,
                    Class.forName("net.minecraft.world.WorldSettings"));
                AgentMod.LOG.debug("E2EE-AGENT launch via func_71371_a");
            } catch (Exception e) {
                for (Method m : mc.getClass().getMethods()) {
                    Class<?>[] p = m.getParameterTypes();
                    if (p.length == 3 && p[0] == String.class && p[1] == String.class) {
                        target = m;
                        break;
                    }
                }
                if (target != null) {
                    AgentMod.LOG.debug("E2EE-AGENT launch via shape scan: "
                        + target.getName());
                }
            }
            if (target == null) {
                state = ST_FAILED;
                stateErr = "no launch method";
                return new Result(false, "failed", stateErr);
            }
            targetWorld = folderName;
            state = ST_JOINING;
            AgentMod.LOG.info("E2EE-AGENT auto-joining " + folderName);
            try {
                target.invoke(mc, folderName, folderName, (Object) null);
            } catch (Exception e) {
                state = ST_FAILED;
                stateErr = "launch failed: " + e;
                return new Result(false, "failed", stateErr);
            }
            return new Result(true, "joining", null);
        } catch (Exception e) {
            state = ST_FAILED;
            stateErr = "join failed: " + e;
            return new Result(false, "failed", stateErr);
        }
    }

    private static void consumeWorldFile() {
        try {
            Object mc = Mc.minecraft();
            File dir = (File) ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"),
                mc, "field_71412_D");
            File f = new File(dir, "e2ee-world.txt");
            if (f.isFile() && f.delete()) {
                AgentMod.LOG.info("E2EE-AGENT consumed e2ee-world.txt");
            }
        } catch (Exception e) {
            AgentMod.LOG.warn("E2EE-AGENT world file not consumed: " + e);
        }
    }
}
