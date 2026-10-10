package com.e2ee.agent;

import java.lang.reflect.Method;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

// Tick-persistent raw key holds. One-shot setKeyBindState can be wiped by
// anything rewriting KeyBinding state mid-tick; re-asserting every client
// tick turns "down" into a real hold. Empty set = no-op. Forge API only.
final class RawHold {
    private static final Set<Integer> HELD = ConcurrentHashMap.newKeySet();
    private static final String M_KEYSTATE = "func_74510_a";

    // Delayed mouse button events: use() turns the head with raw deltas
    // (applies over the next 1-2 frames) and must press RMB only AFTER the
    // turn lands — a same-tick press fires along the OLD ray into the void.
    // Entries are int[]{button, down(1)/up(0), ticksLeft}.
    private static final java.util.Queue<int[]> PENDING =
        new java.util.concurrent.ConcurrentLinkedQueue<int[]>();

    static void pressAfter(int button, int ticks) {
        PENDING.add(new int[] {button, 1, ticks});
    }

    static void releaseAfter(int button, int ticks) {
        PENDING.add(new int[] {button, 0, ticks});
    }

    // Live visibility into the tick queue (no more guessing from logs).
    static int fired = 0;
    static String mopLast = "never";

    static com.google.gson.JsonObject tickState() {
        com.google.gson.JsonObject o = SocketServer.ok();
        o.addProperty("pending", PENDING.size());
        o.addProperty("fired", fired);
        o.addProperty("mop", mopLast);
        return o;
    }

    static void set(int code, boolean down) {
        if (down) {
            HELD.add(Integer.valueOf(code));
        } else {
            HELD.remove(Integer.valueOf(code));
        }
    }

    static int count() {
        return HELD.size();
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent e) {
        if (e.phase == TickEvent.Phase.START) {
            holdKeys();
        } else {
            mirrorIc2Jump();
        }
    }

    static void holdKeys() {
        if (!HELD.isEmpty()) {
            try {
                Class<?> kb = Class.forName("net.minecraft.client.settings.KeyBinding");
                Method m = kb.getMethod(M_KEYSTATE, int.class, boolean.class);
                Integer[] codes = HELD.toArray(new Integer[HELD.size()]);
                for (int i = 0; i < codes.length; i++) {
                    m.invoke(null, codes[i].intValue(), true);
                }
            } catch (Exception ex) {
                AgentMod.LOG.warn("E2EE-AGENT rawhold failed: " + ex);
            }
        }
        // Headless compensation: unfocused, the renderer never runs
        // and vanilla leaves objectMouseOver frozen (null) — a real
        // focused client would have a fresh crosshair raycast. So
        // refresh it every tick while clicks are in flight OR the head
        // is still turning under LookHold (a click may be scheduled
        // next); the head turn (Mouse deltas) and button events stay
        // 100% vanilla.
        if (!PENDING.isEmpty() || LookHold.armed()) {
            try {
                try {
                    Object mc = Mc.minecraft();
                    Object er = net.minecraftforge.fml.common.ObfuscationReflectionHelper
                        .getPrivateValue((Class) Class.forName(
                            "net.minecraft.client.Minecraft"), mc, "field_71460_t");
                    java.lang.reflect.Method mo;
                    try {
                        mo = er.getClass().getMethod("func_78473_a", float.class);
                        mo.invoke(er, 1.0f);
                    } catch (NoSuchMethodException noArg) {
                        mo = er.getClass().getMethod("func_78473_a");
                        mo.invoke(er);
                    }
                    Object mop = net.minecraftforge.fml.common.ObfuscationReflectionHelper
                        .getPrivateValue((Class) Class.forName(
                            "net.minecraft.client.Minecraft"), mc, "field_71476_x");
                    mopLast = mop == null ? "null(still)" : String.valueOf(mop);
                } catch (Exception mopFail) {
                    mopLast = "err:" + mopFail;
                    AgentMod.LOG.warn("E2EE-AGENT mouseover failed: " + mopFail);
                }
                Class<?> mouse;
                try {
                    mouse = Class.forName("org.lwjgl.input.Mouse");
                } catch (ClassNotFoundException e2) {
                    mouse = Class.forName("org.lwjglx.input.Mouse");
                }
                Method add;
                try {
                    add = mouse.getDeclaredMethod(
                        "addButtonEvent", int.class, boolean.class);
                    add.setAccessible(true);
                } catch (Exception noEvent) {
                    add = null;
                }
                int n = PENDING.size();
                for (int i = 0; i < n; i++) {
                    int[] t = PENDING.poll();
                    if (t == null) {
                        break;
                    }
                    if (t[2] <= 1) {
                        if (add != null) {
                            add.invoke(null, t[0], t[1] == 1);
                            fired++;
                        }
                    } else {
                        t[2]--;
                        PENDING.add(t);
                    }
                }
            } catch (Exception ex) {
                AgentMod.LOG.warn("E2EE-AGENT mouseup failed: " + ex);
            }
        }
    }

    // IC2 jetpack mirror. IC2's KeyboardClient.sendKeyUpdate runs on START
    // and reads the PHYSICAL matrix (GameSettings.func_100015_a), so our
    // flag-level holds never reach it. Running on END (after IC2's send) we
    // re-assert the jump bit through IC2's own channel when the held set
    // contains the live jump keycode. Reads IC2.lastKeyState fresh each tick
    // (it already includes any physically pressed IC2 keys), ORs the jump
    // bit, and pushes via initiateKeyUpdate + local processKeyUpdate — the
    // same two calls KeyboardClient itself makes. On release (or a
    // no-input screen) sends the plain state once to clear. All reflective,
    // all in try/catch: IC2 absent means silent no-op.
    // Sneak needs no mirror: IC2.isSneakKeyDown reads player.isSneaking().
    private static boolean ic2Injected = false;

    static void mirrorIc2Jump() {
        try {
            if (HELD.isEmpty() && !ic2Injected) {
                return;
            }
            Class<?> ic2 = Class.forName("ic2.core.IC2");
            Object inst;
            try {
                inst = ic2.getField("instance").get(null);
            } catch (Exception e) {
                inst = ic2.getMethod("getInstance").invoke(null);
            }
            if (inst == null) {
                return;
            }
            Object keyboard = ic2.getField("keyboard").get(inst);
            if (keyboard == null) {
                return;
            }
            Class<?> mcClass = Class.forName("net.minecraft.client.Minecraft");
            Object mcObj = mcClass.getMethod("func_71410_x").invoke(null);
            Object screen = net.minecraftforge.fml.common.ObfuscationReflectionHelper
                .getPrivateValue((Class) mcClass, mcObj, "field_71462_r");
            boolean allowed = screen == null;
            if (!allowed) {
                try {
                    Class<?> guiClass =
                        Class.forName("net.minecraft.client.gui.GuiScreen");
                    allowed = ((Boolean) net.minecraftforge.fml.common
                        .ObfuscationReflectionHelper.getPrivateValue(
                            (Class) guiClass, screen, "field_146291_p"))
                        .booleanValue();
                } catch (Exception e) {
                    allowed = false;
                }
            }
            int jumpCode = 57;
            try {
                Class<?> gsClass =
                    Class.forName("net.minecraft.client.settings.GameSettings");
                Class<?> kbClass =
                    Class.forName("net.minecraft.client.settings.KeyBinding");
                Object gs = net.minecraftforge.fml.common.ObfuscationReflectionHelper
                    .getPrivateValue((Class) mcClass, mcObj, "field_71474_y");
                Object jumpBind = net.minecraftforge.fml.common.ObfuscationReflectionHelper
                    .getPrivateValue((Class) gsClass, gs, "field_74314_A");
                jumpCode = ((Number) net.minecraftforge.fml.common.ObfuscationReflectionHelper
                    .getPrivateValue((Class) kbClass, jumpBind, "field_74512_d"))
                    .intValue();
            } catch (Exception e) {
                jumpCode = 57;
            }
            boolean wantJump = allowed && HELD.contains(Integer.valueOf(jumpCode));
            Class<?> keyClass = Class.forName("ic2.core.util.Keyboard$Key");
            int jumpBit = 0;
            Object[] constants = keyClass.getEnumConstants();
            if (constants != null) {
                for (int i = 0; i < constants.length; i++) {
                    Enum<?> k = (Enum<?>) constants[i];
                    if ("jump".equals(k.name())) {
                        jumpBit = 1 << k.ordinal();
                        break;
                    }
                }
            }
            if (jumpBit == 0) {
                return;
            }
            java.lang.reflect.Field lastF = null;
            Class<?> walk = keyboard.getClass();
            while (walk != null) {
                try {
                    lastF = walk.getDeclaredField("lastKeyState");
                    break;
                } catch (NoSuchFieldException nsf) {
                    walk = walk.getSuperclass();
                }
            }
            if (lastF == null) {
                return;
            }
            lastF.setAccessible(true);
            int last = lastF.getInt(keyboard);
            if (wantJump) {
                int bits = last | jumpBit;
                sendIc2Keys(ic2, inst, keyboard, bits);
                ic2Injected = true;
            } else if (ic2Injected) {
                sendIc2Keys(ic2, inst, keyboard, last);
                ic2Injected = false;
            }
        } catch (Exception ignored) {
        }
    }

    private static void sendIc2Keys(Class<?> ic2, Object inst,
            Object keyboard, int bits) throws Exception {
        Object net = ic2.getField("network").get(inst);
        Object mgr = net.getClass().getMethod("get", boolean.class)
            .invoke(net, Boolean.FALSE);
        mgr.getClass().getMethod("initiateKeyUpdate", int.class)
            .invoke(mgr, Integer.valueOf(bits));
        Object platform = ic2.getField("platform").get(inst);
        Object player = platform.getClass().getMethod("getPlayerInstance")
            .invoke(platform);
        Class<?> epClass =
            Class.forName("net.minecraft.entity.player.EntityPlayer");
        keyboard.getClass().getMethod(
            "processKeyUpdate", epClass, int.class)
            .invoke(keyboard, player, Integer.valueOf(bits));
    }
}
