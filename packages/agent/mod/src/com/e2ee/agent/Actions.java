package com.e2ee.agent;

import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import java.lang.reflect.Method;
import java.util.List;
import java.util.concurrent.Callable;

import net.minecraftforge.fml.common.ObfuscationReflectionHelper;

// Player intents. Every method hops to the client thread via Mc.sync.
// All member names are stable_39 SRG strings; classes via Class.forName
// (stable names), so javac never needs a deobfuscated jar.
final class Actions {
    private Actions() {
    }

    private static final String M_CHAT = "func_71165_d";
    private static final String M_KEYSTATE = "func_74510_a";
    private static final String M_CLICK = "func_187098_a";
    private static final String M_GETITEM = "func_77973_b";
    private static final String M_COUNT = "func_190916_E";
    private static final String M_ISEMPTY = "func_190926_b";
    private static final String M_DAMAGE = "func_77952_i";
    private static final String F_YAW = "field_70177_z";
    private static final String F_PITCH = "field_70125_A";
    private static final String F_POSX = "field_70165_t";
    private static final String F_POSY = "field_70163_u";
    private static final String F_POSZ = "field_70161_v";
    private static final String M_GETHEALTH = "func_110143_aJ";
    private static final String F_CONTROLLER = "field_71442_b";
    private static final String F_OPENCONTAINER = "field_71070_bA";
    private static final String F_WINDOWID = "field_75152_c";
    private static final String F_SLOTS = "field_75151_b";
    private static final String F_MAININV = "field_70462_a";

    private static Class<?> cls(String name) throws Exception {
        return Class.forName(name);
    }

    // Registry id of the block at xyz in the CLIENT world, e.g. minecraft:stone.
    static JsonObject block(final int x, final int y, final int z) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Object world = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71441_e");
                if (world == null) {
                    return SocketServer.err("no world");
                }
                Class<?> posClass = cls("net.minecraft.util.math.BlockPos");
                Object pos = posClass.getConstructor(int.class, int.class, int.class)
                    .newInstance(x, y, z);
                Object state = world.getClass().getMethod("func_180495_p", posClass).invoke(world, pos);
                Object block = state.getClass().getMethod("func_177230_c").invoke(state);
                Object rl = block.getClass().getMethod("getRegistryName").invoke(block);
                JsonObject o = SocketServer.ok();
                o.addProperty("id", String.valueOf(rl));
                return o;
            }
        });
    }

    // Click the first button whose label contains the given text on the
    // current GuiScreen (e.g. "Respawn" on GuiGameOver). General GUI driver.
    static JsonObject guibtn(final String label) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Object screen = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71462_r");
                if (screen == null) {
                    return SocketServer.err("no screen");
                }
                Class<?> guiScreen = cls("net.minecraft.client.gui.GuiScreen");
                Class<?> guiButton = cls("net.minecraft.client.gui.GuiButton");
                List<Object> buttons = (List<Object>) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) guiScreen, screen, "field_146292_n");
                for (Object b : buttons) {
                    String text = (String) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) guiButton, b, "field_146126_j");
                    if (text != null && text.contains(label)) {
                        Method action = guiScreen.getDeclaredMethod("func_146284_a", guiButton);
                        action.setAccessible(true);
                        action.invoke(screen, b);
                        JsonObject o = SocketServer.ok();
                        o.addProperty("screen", screen.getClass().getName());
                        o.addProperty("clicked", text);
                        return o;
                    }
                }
                return SocketServer.err("no button: " + label);
            }
        });
    }

    // Declared method names+param types of any class (runtime API probe).
    // Pure reflection: no game state, runs on the socket thread.
    static JsonObject methods(String className) throws Exception {
        Class<?> c = Class.forName(className);
        JsonObject o = SocketServer.ok();
        JsonArray arr = new JsonArray();
        Class<?> walk = c;
        while (walk != null) {
            java.lang.reflect.Method[] ms = walk.getDeclaredMethods();
            for (int i = 0; i < ms.length; i++) {
                StringBuilder sig = new StringBuilder(ms[i].getName()).append('(');
                Class<?>[] ps = ms[i].getParameterTypes();
                for (int j = 0; j < ps.length; j++) {
                    if (j > 0) {
                        sig.append(',');
                    }
                    sig.append(ps[j].getSimpleName());
                }
                arr.add(sig.append(')').toString());
            }
            walk = walk.getSuperclass();
        }
        o.add("methods", arr);
        return o;
    }

    // Declared field names+types of any class (runtime SRG names).
    // Pure reflection: no game state, runs on the socket thread.
    static JsonObject fields(String className) throws Exception {
        Class<?> c = Class.forName(className);
        JsonObject o = SocketServer.ok();
        JsonArray arr = new JsonArray();
        Class<?> walk = c;
        while (walk != null) {
            java.lang.reflect.Field[] fs = walk.getDeclaredFields();
            for (int i = 0; i < fs.length; i++) {
                arr.add(fs[i].getName() + ":" + fs[i].getType().getSimpleName());
            }
            walk = walk.getSuperclass();
        }
        o.add("fields", arr);
        return o;
    }

    // RAW FIRST: open a block (chest) the way a real player does — turn the
    // head with raw Mouse deltas, then press RMB as a vanilla button event.
    // No processRightClickBlock: the client thread + server roundtrip do the
    // opening, caller polls state/screen.
    static JsonObject use(final int x, final int y, final int z) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Object p = Mc.player();
                double px = Mc.d(p, "field_70165_t");
                double py = Mc.d(p, "field_70163_u");
                double pz = Mc.d(p, "field_70161_v");
                double eyeY = py + ((Number) p.getClass().getMethod(
                    "func_70047_e").invoke(p)).doubleValue();
                double dx = (x + 0.5) - px;
                double dy = (y + 0.5) - eyeY;
                double dz = (z + 0.5) - pz;
                float wantYaw = (float) (Math.atan2(-dx, dz) * 180.0 / Math.PI);
                float wantPitch = (float) (-(Math.atan2(
                    dy, Math.sqrt(dx * dx + dz * dz)) * 180.0 / Math.PI));
                float curYaw = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) Mc.entityClass(), p, F_YAW)).floatValue();
                float curPitch = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) Mc.entityClass(), p, F_PITCH)).floatValue();
                float dYaw = wantYaw - curYaw;
                while (dYaw > 180.0f) {
                    dYaw -= 360.0f;
                }
                while (dYaw < -180.0f) {
                    dYaw += 360.0f;
                }
                float dPitch = Math.max(-90.0f, Math.min(90.0f, wantPitch)) - curPitch;
                Object gs = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71474_y");
                float sens = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.settings.GameSettings"),
                    gs, "field_74341_c")).floatValue();
                float f = sens * 0.6f + 0.2f;
                float mult = f * f * f * 8.0f * 0.15f;
                Class<?> mouse = inputClass(
                    "org.lwjgl.input.Mouse", "org.lwjglx.input.Mouse");
                // Schedule first, arm last: if the inject throws, no armed
                // turn is left behind to spin the head with no click coming.
                String how = lookDeltaInject(mouse,
                    dYaw / mult, -dPitch / mult);
                // Press lands at +4 ticks (head turned by then), release at
                // +10: a same-tick down+up would fire along the old ray.
                RawHold.pressAfter(1, 4);
                RawHold.releaseAfter(1, 10);
                LookHold.armDegrees(dYaw, dPitch);
                String via = mouse.getName() + ":event@+4/+10/" + how;
                JsonObject o = SocketServer.ok();
                o.addProperty("via", via);
                o.addProperty("yaw", wantYaw);
                o.addProperty("pitch", wantPitch);
                return o;
            }
        });
    }

    // First of two class names that loads (dual org.lwjgl/org.lwjglx:
    // lwjglxx compat registers under both prefixes depending on the pack).
    static Class<?> inputClass(String a, String b) throws Exception {
        try {
            return cls(a);
        } catch (ClassNotFoundException e) {
            return cls(b);
        }
    }

    // Raw held key at LWJGL code level (17 = W): one-shot setKeyBindState
    // plus a client-tick hold (RawHold) so the press survives to movement.
    // Down-edge also sets pressed/pressTime on the binding instance itself
    // (vanilla onTick equivalent): press-edge actions (E, T, digits) need
    // pressTime, which setKeyBindState alone never touches.
    static JsonObject rawkey(final int code, final boolean down) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Class<?> kb = cls("net.minecraft.client.settings.KeyBinding");
                Method m = kb.getMethod("func_74510_a", int.class, boolean.class);
                m.invoke(null, code, down);
                RawHold.set(code, down);
                String edge = "none";
                // Down-edge sets pressed/pressTime on the binding instance
                // (vanilla onTick equivalent); up-edge clears pressed again.
                // Both go through the keyBindings array directly because the
                // static KeyBinding map misses our codes (map:miss) and the
                // one-shot setKeyBindState alone never touches them.
                try {
                    Class<?> kbCls = kb;
                    String mapHit = "miss";
                    try {
                        java.util.Map<Object, Object> map =
                            (java.util.Map<Object, Object>) ObfuscationReflectionHelper.getPrivateValue(
                                (Class) kbCls, null, "field_74516_a");
                        if (map != null && map.get(Integer.valueOf(code)) != null) {
                            mapHit = "hit";
                        }
                    } catch (Exception e) {
                        mapHit = "err";
                    }
                    String arrHit = "miss";
                    try {
                        Object mc = Mc.minecraft();
                        Object gs = ObfuscationReflectionHelper.getPrivateValue(
                            (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71474_y");
                        // keyBindings array is field_74324_K (NOT field_151456_ac).
                        Object[] binds = (Object[]) ObfuscationReflectionHelper.getPrivateValue(
                            (Class) cls("net.minecraft.client.settings.GameSettings"),
                            gs, "field_74324_K");
                        for (int i = 0; i < binds.length; i++) {
                            // keyCode=field_74512_d, pressTime=field_151474_i
                            // (field_151472_e is keyCodeDefault, not the live code).
                            int kc = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                                (Class) kbCls, binds[i], "field_74512_d")).intValue();
                            if (kc == code) {
                                ObfuscationReflectionHelper.setPrivateValue(
                                    (Class) kbCls, binds[i],
                                    Boolean.valueOf(down), "field_74513_e");
                                if (down) {
                                    int pt = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                                        (Class) kbCls, binds[i], "field_151474_i")).intValue();
                                    ObfuscationReflectionHelper.setPrivateValue(
                                        (Class) kbCls, binds[i],
                                        Integer.valueOf(pt + 1), "field_151474_i");
                                } else {
                                    // No phantom isPressed() after release:
                                    // unconsumed pressTime would fire once.
                                    ObfuscationReflectionHelper.setPrivateValue(
                                        (Class) kbCls, binds[i],
                                        Integer.valueOf(0), "field_151474_i");
                                }
                                arrHit = down ? "hit" : "cleared";
                                break;
                            }
                        }
                    } catch (Exception e) {
                        arrHit = "err:" + e.getMessage();
                    }
                    edge = "map:" + mapHit + ",array:" + arrHit;
                } catch (Exception e) {
                    edge = "err:" + e.getMessage();
                }
                JsonObject o = SocketServer.ok();
                o.addProperty("held", RawHold.count());
                o.addProperty("edge", edge);
                String via = "none";
                try {
                    Class<?> lwjgl = inputClass(
                        "org.lwjgl.input.Keyboard", "org.lwjglx.input.Keyboard");
                    Method addKey = lwjgl.getMethod(
                        "addKeyEvent", int.class, boolean.class);
                    addKey.invoke(null, code, down);
                    via = lwjgl.getName() + ":keyevent";
                } catch (Exception e) {
                    via = "err:" + e.getMessage();
                }
                o.addProperty("via", via);
                return o;
            }
        });
    }

    // Relative mouse look: one-shot event-path inject plus a closed-loop
    // tick repeater (LookHold) that drives the live head to the degree
    // target no matter how many frame polls wipe the accumulators.
    static JsonObject lookdelta(final float dx, final float dy) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                Class<?> mouse = inputClass(
                    "org.lwjgl.input.Mouse", "org.lwjglx.input.Mouse");
                LookHold.ensureFocus();
                float mult = LookHold.sensitivityMult();
                LookHold.armDegrees(dx * mult, -dy * mult);
                String via = lookDeltaInject(mouse, dx, dy);
                JsonObject o = SocketServer.ok();
                o.addProperty("via", via + "+closedloop");
                return o;
            }
        });
    }

    // Inject a look delta into the LIVE Mouse accumulators. Direct dx/dy
    // field writes land in the inert twin when two Mouse copies coexist
    // (org.lwjgl vs org.lwjglx): buttons/absolute moves work because they
    // go through the event path. So deltas go through addMoveEvent too:
    // dx_acc += xArg*scale - latestX, therefore xArg = (latestX + dx)/scale
    // (and mirrored for Y with the display-height flip). Direct field add
    // survives only as fallback.
    static String lookDeltaInject(Class<?> mouse, float dx, float dy) throws Exception {
        String via = mouse.getName() + ":event";
        try {
            java.lang.reflect.Field lx = mouse.getDeclaredField("latestX");
            lx.setAccessible(true);
            java.lang.reflect.Field ly = mouse.getDeclaredField("latestY");
            ly.setAccessible(true);
            float scale = 1.0f;
            int dispH = 0;
            try {
                String pkg = mouse.getName().substring(0, mouse.getName().lastIndexOf(".input.Mouse"));
                Class<?> disp = Class.forName(pkg + ".opengl.Display");
                scale = ((Number) disp.getMethod("getPixelScaleFactor").invoke(null)).floatValue();
                dispH = ((Number) disp.getMethod("getHeight").invoke(null)).intValue();
                if (scale <= 0.0f) {
                    scale = 1.0f;
                }
            } catch (Exception e) {
                scale = 1.0f;
            }
            if (dispH <= 0) {
                throw new NoSuchMethodException("no display height");
            }
            double xArg = (lx.getInt(null) + dx) / scale;
            double yArg = (dispH - ly.getInt(null) - dy) / scale;
            Method add = mouse.getDeclaredMethod(
                "addMoveEvent", double.class, double.class);
            add.setAccessible(true);
            add.invoke(null, xArg, yArg);
        } catch (Exception e) {
            java.lang.reflect.Field fx = mouse.getDeclaredField("dx");
            fx.setAccessible(true);
            fx.setInt(null, fx.getInt(null) + (int) dx);
            java.lang.reflect.Field fy = mouse.getDeclaredField("dy");
            fy.setAccessible(true);
            fy.setInt(null, fy.getInt(null) + (int) dy);
            via = mouse.getName() + ":buffer";
        }
        return via;
    }

    // Raw mouse button state (0 = left/attack, 1 = right/use).
    // Event path first: vanilla clicks come from Mouse.next() events, the
    // buttons buffer only feeds isButtonDown. Buffer write is the fallback.
    static JsonObject mousebtn(final int button, final boolean down) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                Class<?> mouse = inputClass(
                    "org.lwjgl.input.Mouse", "org.lwjglx.input.Mouse");
                String via = mouse.getName() + ":event";
                try {
                    Method add = mouse.getDeclaredMethod(
                        "addButtonEvent", int.class, boolean.class);
                    add.setAccessible(true);
                    add.invoke(null, button, down);
                } catch (NoSuchMethodException e) {
                    java.lang.reflect.Field fb = mouse.getDeclaredField("buttons");
                    fb.setAccessible(true);
                    java.nio.ByteBuffer buf = (java.nio.ByteBuffer) fb.get(null);
                    buf.put(button, (byte) (down ? 1 : 0));
                    via = mouse.getName() + ":buffer";
                }
                JsonObject o = SocketServer.ok();
                o.addProperty("via", via);
                return o;
            }
        });
    }

    // Dump the currently open container: windowId + every slot.
    // (Sorter work reads chest contents through this; inv covers only the
    // player inventory.) Null per empty slot, else id/n/dmg.
    static JsonObject winv() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object p = Mc.player();
                Object container = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.entity.player.EntityPlayer"), p, F_OPENCONTAINER);
                int windowId = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.inventory.Container"), container, F_WINDOWID)).intValue();
                List<Object> slots = (List<Object>) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.inventory.Container"), container, F_SLOTS);
                JsonObject o = SocketServer.ok();
                o.addProperty("windowId", windowId);
                JsonArray arr = new JsonArray();
                for (int i = 0; i < slots.size(); i++) {
                    Object slot = slots.get(i);
                    Method getStack = slot.getClass().getMethod("func_75211_c");
                    Object stack = getStack.invoke(slot);
                    arr.add(slotJson(stack));
                }
                o.add("slots", arr);
                return o;
            }
        });
    }

    // Screenshot of the game window: vanilla saveScreenshot into
    // screenshots/, then the newest PNG as base64. Big reply (~0.5 MB),
    // localhost only. Proves visuals (cursor, GUI) without looking.
    static JsonObject shot() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Class<?> mcClass = cls("net.minecraft.client.Minecraft");
                Object fb = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) mcClass, mc, "field_147124_at");
                java.io.File gameDir = (java.io.File) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) mcClass, mc, "field_71412_D");
                int w = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) mcClass, mc, "field_71443_c")).intValue();
                int h = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) mcClass, mc, "field_71440_d")).intValue();
                Method save = null;
                for (Method m : cls("net.minecraft.util.ScreenShotHelper").getMethods()) {
                    if (m.getName().equals("func_148260_a")
                        && m.getParameterTypes().length == 4) {
                        save = m;
                        break;
                    }
                }
                if (save == null) {
                    return SocketServer.err("no saveScreenshot");
                }
                save.invoke(null, gameDir, w, h, fb);
                java.io.File dir = new java.io.File(gameDir, "screenshots");
                java.io.File[] pngs = dir.listFiles(new java.io.FilenameFilter() {
                    @Override
                    public boolean accept(java.io.File d, String n) {
                        return n.endsWith(".png");
                    }
                });
                if (pngs == null || pngs.length == 0) {
                    return SocketServer.err("no png");
                }
                java.io.File newest = pngs[0];
                for (int i = 1; i < pngs.length; i++) {
                    if (pngs[i].lastModified() > newest.lastModified()) {
                        newest = pngs[i];
                    }
                }
                byte[] bytes = java.nio.file.Files.readAllBytes(newest.toPath());
                String b64 = java.util.Base64.getEncoder().encodeToString(bytes);
                JsonObject o = SocketServer.ok();
                o.addProperty("file", newest.getName());
                o.addProperty("n", bytes.length);
                o.addProperty("png", b64);
                return o;
            }
        });
    }

    // All Item.REGISTRY keys (e.g. minecraft:stone). Tries the vanilla
    // static field first (SRG field_150901_e), falls back to
    // ForgeRegistries.ITEMS (same content, stable Forge name).
    static JsonObject regdump() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object registry = null;
                try {
                    registry = cls("net.minecraft.item.Item").getField("field_150901_e").get(null);
                } catch (Exception e) {
                    Object fr = cls("net.minecraftforge.registries.ForgeRegistries")
                        .getField("ITEMS").get(null);
                    registry = fr;
                }
                Method keys = null;
                for (Method m : registry.getClass().getMethods()) {
                    if ((m.getName().equals("func_148742_b") || m.getName().equals("getKeys"))
                        && m.getParameterTypes().length == 0) {
                        keys = m;
                        break;
                    }
                }
                if (keys == null) {
                    return SocketServer.err("no getKeys");
                }
                keys.setAccessible(true);
                java.util.Set<Object> set = (java.util.Set<Object>) keys.invoke(registry);
                java.util.List<String> ids = new java.util.ArrayList<String>(set.size());
                for (Object k : set) {
                    ids.add(String.valueOf(k));
                }
                java.util.Collections.sort(ids);
                JsonObject o = SocketServer.ok();
                o.addProperty("count", ids.size());
                JsonArray arr = new JsonArray();
                for (int i = 0; i < ids.size(); i++) {
                    arr.add(ids.get(i));
                }
                o.add("ids", arr);
                return o;
            }
        });
    }

    // Display name of player-inventory slot 0-35 (getDisplayName).
    static JsonObject stackname(final int slot) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object p = Mc.player();
                Object invPlayer = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.entity.player.EntityPlayer"), p, "field_71071_by");
                List<Object> main = (List<Object>) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.entity.player.InventoryPlayer"), invPlayer, F_MAININV);
                if (slot < 0 || slot >= main.size()) {
                    return SocketServer.err("bad slot");
                }
                Object stack = main.get(slot);
                Method empty = stack.getClass().getMethod(M_ISEMPTY);
                if ((Boolean) empty.invoke(stack)) {
                    return SocketServer.err("empty");
                }
                Method getItem = stack.getClass().getMethod(M_GETITEM);
                Object item = getItem.invoke(stack);
                Object rl = item.getClass().getMethod("getRegistryName").invoke(item);
                Method count = stack.getClass().getMethod(M_COUNT);
                int n = ((Number) count.invoke(stack)).intValue();
                Method dn = stack.getClass().getMethod("func_82833_r");
                String name = String.valueOf(dn.invoke(stack));
                JsonObject o = SocketServer.ok();
                o.addProperty("id", String.valueOf(rl));
                o.addProperty("name", name);
                o.addProperty("n", n);
                return o;
            }
        });
    }

    // Bot cursor: virtual position in scaled GUI coords (y-down), shown as
    // a magenta crosshair. Never touches the OS mouse: hover/click steer
    // vanilla's Mouse position through addMoveEvent for a few ticks.
    static JsonObject cursor(final int x, final int y) throws Exception {
        int[] s = CursorBot.scaled();
        CursorBot.sx = Math.max(0, Math.min(s[0] - 1, x));
        CursorBot.sy = Math.max(0, Math.min(s[1] - 1, y));
        CursorBot.visible = true;
        return CursorBot.stateJson();
    }

    static JsonObject cursordelta(final int dx, final int dy) throws Exception {
        int[] s = CursorBot.scaled();
        if (CursorBot.sx < 0 || CursorBot.sy < 0) {
            CursorBot.sx = s[0] / 2;
            CursorBot.sy = s[1] / 2;
        }
        return cursor(CursorBot.sx + dx, CursorBot.sy + dy);
    }

    static JsonObject cursoroff() throws Exception {
        CursorBot.visible = false;
        CursorBot.hoverTicks = 0;
        return CursorBot.stateJson();
    }

    static JsonObject cursorhover(final int ticks) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                CursorBot.hoverTicks = ticks <= 0 ? 10 : ticks;
                CursorBot.moveNow();
                return CursorBot.stateJson();
            }
        });
    }

    static JsonObject cursorclick(final int button) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                CursorBot.moveNow();
                if (CursorBot.hoverTicks < 8) {
                    CursorBot.hoverTicks = 8;
                }
                RawHold.pressAfter(button, 2);
                RawHold.releaseAfter(button, 6);
                return CursorBot.stateJson();
            }
        });
    }

    static JsonObject cursorstate() throws Exception {
        return CursorBot.stateJson();
    }

    // What the open GuiContainer sees under the CURRENT vanilla Mouse
    // position (proves a virtual hover landed: arm cursorhover, wait a
    // tick or two, read). Non-container screens report screen+null slot.
    static JsonObject cursorslot() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Object screen = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71462_r");
                if (screen == null) {
                    return SocketServer.err("no screen");
                }
                Class<?> gc = cls("net.minecraft.client.gui.inventory.GuiContainer");
                if (!gc.isInstance(screen)) {
                    JsonObject o = SocketServer.ok();
                    o.add("slot", JsonNull.INSTANCE);
                    o.addProperty("screen", screen.getClass().getName());
                    return o;
                }
                Object slot = screen.getClass().getMethod("getSlotUnderMouse").invoke(screen);
                if (slot == null) {
                    JsonObject o = SocketServer.ok();
                    o.add("slot", JsonNull.INSTANCE);
                    return o;
                }
                int num = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.inventory.Slot"),
                    slot, "field_75222_d")).intValue();
                JsonObject o = SocketServer.ok();
                o.addProperty("slot", num);
                try {
                    int spx = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) cls("net.minecraft.inventory.Slot"),
                        slot, "field_75223_e")).intValue();
                    int spy = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) cls("net.minecraft.inventory.Slot"),
                        slot, "field_75221_f")).intValue();
                    int gl = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) gc, screen, "field_147003_i")).intValue();
                    int gt = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) gc, screen, "field_147009_r")).intValue();
                    o.addProperty("x", gl + spx);
                    o.addProperty("y", gt + spy);
                } catch (Exception e) {
                    // rect stays absent; slot number is the payload.
                }
                return o;
            }
        });
    }

    // Close any open GuiScreen (displayGuiScreen(null)). Test hermeticity:
    // movement/clicks need screen none, chest/inventory tests leave one open.
    // Also closes the server-side container (player.closeScreen) so a chest
    // GuiChest does not linger open server-side after a display-null only.
    static JsonObject close() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                try {
                    Object p = Mc.player();
                    p.getClass().getMethod("func_71053_j").invoke(p);
                } catch (Exception ignored) {
                }
                Method m = mc.getClass().getMethod("func_147108_a",
                    cls("net.minecraft.client.gui.GuiScreen"));
                m.invoke(mc, new Object[] {null});
                JsonObject o = SocketServer.ok();
                o.addProperty("screen", Mc.screenName());
                return o;
            }
        });
    }

    // GUI key event via the Keyboard queue: GuiScreen.keyTyped reads
    // Keyboard.getEventKey/Character, NOT KeyBinding state — so rawkey can
    // never press Esc/E in a GUI. addKeyEvent(key, state) feeds that queue.
    static JsonObject keybd(final int code, final boolean down) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                Class<?> kb = inputClass(
                    "org.lwjgl.input.Keyboard", "org.lwjglx.input.Keyboard");
                Method m = kb.getMethod("addKeyEvent", int.class, boolean.class);
                m.invoke(null, code, down);
                JsonObject o = SocketServer.ok();
                o.addProperty("via", kb.getName());
                return o;
            }
        });
    }

    // Situational awareness: motion vector + air gap below feet + ground id.
    // dy = air blocks between feet block and first solid (1 = standing).
    // ground = "void" when nothing solid down to y=0.
    static JsonObject trace() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object p = Mc.player();
                double x = Mc.d(p, "field_70165_t");
                double y = Mc.d(p, "field_70163_u");
                double z = Mc.d(p, "field_70161_v");
                double mx = Mc.d(p, "field_70159_w");
                double my = Mc.d(p, "field_70181_x");
                double mz = Mc.d(p, "field_70179_y");
                String ground = "void";
                int dy = -1;
                Object mc = Mc.minecraft();
                Object world = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71441_e");
                Class<?> posClass = null;
                if (world != null) {
                    posClass = cls("net.minecraft.util.math.BlockPos");
                    java.lang.reflect.Constructor<?> ctor =
                        posClass.getConstructor(int.class, int.class, int.class);
                    Method isAir = null;
                    Method[] ms = world.getClass().getMethods();
                    for (int i = 0; i < ms.length; i++) {
                        // isAirBlock(BlockPos) — NOT func_175697_a (wrong fn,
                        // always-true: every trace reported void).
                        if (ms[i].getName().equals("func_175623_d")
                            && ms[i].getParameterTypes().length == 1) {
                            isAir = ms[i];
                            break;
                        }
                    }
                    if (isAir != null) {
                        int bx = (int) Math.floor(x);
                        int bz = (int) Math.floor(z);
                        int feet = (int) Math.floor(y);
                        for (int yy = feet; yy >= 0; yy--) {
                            Object bp = ctor.newInstance(bx, yy, bz);
                            boolean air = ((Boolean) isAir.invoke(world, bp)).booleanValue();
                            if (!air) {
                                dy = feet - yy;
                                Object state = world.getClass().getMethod(
                                    "func_180495_p", posClass).invoke(world, bp);
                                Object block = state.getClass().getMethod(
                                    "func_177230_c").invoke(state);
                                Object rl = block.getClass().getMethod(
                                    "getRegistryName").invoke(block);
                                ground = String.valueOf(rl);
                                break;
                            }
                        }
                    }
                }
                // Aim check for the raw open path: where the head points and
                // what vanilla raycast (objectMouseOver) actually hovers.
                float yaw = 0.0f;
                float pitch = 0.0f;
                String hover = "none";
                try {
                    yaw = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) Mc.entityClass(), p, F_YAW)).floatValue();
                    pitch = ((Number) ObfuscationReflectionHelper.getPrivateValue(
                        (Class) Mc.entityClass(), p, F_PITCH)).floatValue();
                    // Deterministic crosshair raycast (own code, no renderer):
                    // eye -> eye + look * 4.5 through World.rayTraceBlocks.
                    // Vanilla's objectMouseOver goes null/stale whenever the
                    // unfocused renderer idles, so it can't be trusted here.
                    // (The click queue still refreshes the vanilla field too,
                    // because rightClickMouse itself reads it.)
                    if (world != null && posClass != null) {
                        try {
                            Class<?> vecClass = cls("net.minecraft.util.math.Vec3d");
                            Object eye = p.getClass().getMethod(
                                "func_174824_e", float.class).invoke(p, 1.0f);
                            Object look = p.getClass().getMethod(
                                "func_70676_i", float.class).invoke(p, 1.0f);
                            double ex = vecClass.getField("field_72450_a").getDouble(eye);
                            double ey = vecClass.getField("field_72448_b").getDouble(eye);
                            double ez = vecClass.getField("field_72449_c").getDouble(eye);
                            double lx = vecClass.getField("field_72450_a").getDouble(look);
                            double ly = vecClass.getField("field_72448_b").getDouble(look);
                            double lz = vecClass.getField("field_72449_c").getDouble(look);
                            java.lang.reflect.Constructor<?> vctor = vecClass.getConstructor(
                                double.class, double.class, double.class);
                            Object end = vctor.newInstance(
                                ex + lx * 4.5, ey + ly * 4.5, ez + lz * 4.5);
                            Method ray = null;
                            for (Method m : world.getClass().getMethods()) {
                                Class<?>[] ps = m.getParameterTypes();
                                if (ps.length == 5
                                    && ps[0] == vecClass && ps[1] == vecClass
                                    && ps[2] == boolean.class
                                    && m.getReturnType() != void.class) {
                                    // Prefer the classic raycast; any
                                    // (Vec3d,Vec3d,boolean,boolean,boolean)
                                    // overload will do.
                                    if (m.getName().equals("func_147447_a")) {
                                        ray = m;
                                        break;
                                    }
                                    if (ray == null) {
                                        ray = m;
                                    }
                                }
                            }
                            if (ray != null) {
                                Object hit = ray.invoke(world, eye, end,
                                    false, false, false);
                                if (hit != null) {
                                    Object type = hit.getClass()
                                        .getField("field_72313_a").get(hit);
                                    String ts = String.valueOf(type);
                                    if (ts.contains("BLOCK")) {
                                        Object bp = hit.getClass().getMethod(
                                            "func_178782_a").invoke(hit);
                                        Object state = world.getClass().getMethod(
                                            "func_180495_p", posClass).invoke(world, bp);
                                        Object block = state.getClass().getMethod(
                                            "func_177230_c").invoke(state);
                                        Object rl = block.getClass().getMethod(
                                            "getRegistryName").invoke(block);
                                        hover = "BLOCK " + bp + " " + rl;
                                    } else {
                                        hover = ts;
                                    }
                                } else {
                                    hover = "MISS";
                                }
                            }
                        } catch (Exception ignored2) {
                            hover = "ERR:" + String.valueOf(ignored2);
                        }
                    }
                } catch (Exception ignored) {
                }
                JsonObject o = SocketServer.ok();
                o.addProperty("mx", mx);
                o.addProperty("my", my);
                o.addProperty("mz", mz);
                o.addProperty("dy", dy);
                o.addProperty("ground", ground);
                o.addProperty("yaw", yaw);
                o.addProperty("pitch", pitch);
                o.addProperty("hover", hover);
                return o;
            }
        });
    }

    // Drain raw Mouse events (up to 8): proves whether injected button
    // events reach the vanilla Mouse.next() queue. [] = nothing pending.
    // Disable pause-on-focus-loss (GameSettings.field_82881_y, the F3+P
    // flag): an unfocused window reopens GuiIngameMenu within a tick of
    // every close, which eats movement and clicks. Headless-test staple.
    static JsonObject nopause() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object mc = Mc.minecraft();
                Object gs = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.client.Minecraft"), mc, "field_71474_y");
                ObfuscationReflectionHelper.setPrivateValue(
                    (Class) cls("net.minecraft.client.settings.GameSettings"),
                    gs, Boolean.FALSE, "field_82881_y");
                JsonObject o = SocketServer.ok();
                o.addProperty("pauseOnLostFocus", false);
                return o;
            }
        });
    }

    // Run a server command on the integrated-server thread and capture what
    // it tells the sender (e.g. /time query daytime -> "The time is 123").
    // Sender is a Proxy over ICommandSender (runtime-loaded, so no
    // compile-time MC interface): dispatch is by signature, never by SRG
    // name — the only SRG string is getUnformattedText, with fallbacks.
    static JsonObject cmd(final String text) throws Exception {
        Object mc = Mc.minecraft();
        final Object server = integratedServer(mc);
        if (server == null) {
            return SocketServer.err("no world");
        }
        java.lang.reflect.Method addTask = null;
        for (java.lang.reflect.Method m : server.getClass().getMethods()) {
            Class<?>[] p = m.getParameterTypes();
            if (p.length == 1 && p[0] == Runnable.class) {
                addTask = m;
                break;
            }
        }
        if (addTask == null) {
            return SocketServer.err("no addScheduledTask");
        }
        final String command = text.startsWith("/") ? text.substring(1) : text;
        final StringBuilder out = new StringBuilder();
        java.util.concurrent.FutureTask<Integer> task =
            new java.util.concurrent.FutureTask<Integer>(new Callable<Integer>() {
                @Override
                public Integer call() throws Exception {
                    Object mgr = commandManager(server);
                    java.lang.reflect.Method exec = null;
                    Class<?> senderIf = cls("net.minecraft.command.ICommandSender");
                    for (java.lang.reflect.Method m : mgr.getClass().getMethods()) {
                        Class<?>[] p = m.getParameterTypes();
                        if (p.length == 2 && p[0] == senderIf && p[1] == String.class) {
                            exec = m;
                            break;
                        }
                    }
                    if (exec == null) {
                        throw new IllegalStateException("no executeCommand");
                    }
                    Object sender = captureSender(senderIf, server, out);
                    return (Integer) exec.invoke(mgr, sender, command);
                }
            });
        addTask.invoke(server, task);
        int result = task.get(10, java.util.concurrent.TimeUnit.SECONDS);
        // Server truth, RMI-parity: unknown commands / failures yield
        // success count 0 (vanilla still sends the "Unknown command..."
        // text to the sender, so output carries the reason).
        boolean ok = result > 0;
        String s = out.toString();
        if (s.endsWith("\n")) {
            s = s.substring(0, s.length() - 1);
        }
        JsonObject o = SocketServer.ok();
        o.addProperty("success", result);
        o.addProperty("output", s);
        if (!ok) {
            o.addProperty("ok", false);
        }
        return o;
    }

    private static Object integratedServer(Object mc) throws Exception {
        for (java.lang.reflect.Method m : mc.getClass().getMethods()) {
            if (m.getParameterTypes().length == 0
                && m.getReturnType().getName()
                    .equals("net.minecraft.server.integrated.IntegratedServer")) {
                return m.invoke(mc);
            }
        }
        return null;
    }

    private static Object commandManager(Object server) throws Exception {
        for (java.lang.reflect.Method m : server.getClass().getMethods()) {
            if (m.getParameterTypes().length == 0
                && m.getReturnType().getName()
                    .equals("net.minecraft.command.ICommandManager")) {
                return m.invoke(server);
            }
        }
        throw new IllegalStateException("no getCommandManager");
    }

    private static Object textComponent(String s) throws Exception {
        return cls("net.minecraft.util.text.TextComponentString")
            .getConstructor(String.class).newInstance(s);
    }

    private static String unformatted(Object comp) {
        try {
            try {
                // getUnformattedText (stable_39); plain text, no section signs.
                return String.valueOf(comp.getClass()
                    .getMethod("func_150260_c").invoke(comp));
            } catch (Exception e) {
                // getFormattedText fallback (may carry section-sign codes).
                return String.valueOf(comp.getClass()
                    .getMethod("func_150254_d").invoke(comp));
            }
        } catch (Exception e) {
            return String.valueOf(comp);
        }
    }

    private static Object serverWorld(Object server) {
        // getWorld(int): scan by shape (int -> net.minecraft.world.*).
        for (java.lang.reflect.Method m : server.getClass().getMethods()) {
            Class<?>[] ps = m.getParameterTypes();
            if (ps.length == 1 && ps[0] == int.class
                && m.getReturnType().getName().startsWith("net.minecraft.world.")) {
                try {
                    Object w = m.invoke(server, 0);
                    if (w != null) {
                        return w;
                    }
                } catch (Exception ignored) {
                }
            }
        }
        return null;
    }

    private static int[] playerBlock() {
        try {
            Object p = Mc.player();
            return new int[] {
                (int) Math.floor(Mc.d(p, F_POSX)),
                (int) Math.floor(Mc.d(p, F_POSY)),
                (int) Math.floor(Mc.d(p, F_POSZ))};
        } catch (Exception e) {
            return new int[] {0, 0, 0};
        }
    }

    private static Object playerBlockPos() {
        int[] b = playerBlock();
        try {
            return cls("net.minecraft.util.math.BlockPos")
                .getConstructor(int.class, int.class, int.class)
                .newInstance(b[0], b[1], b[2]);
        } catch (Exception e) {
            return null;
        }
    }

    private static Object captureSender(Class<?> senderIf, final Object server,
            final StringBuilder out) throws Exception {
        final Object clientWorld = ObfuscationReflectionHelper.getPrivateValue(
            (Class) cls("net.minecraft.client.Minecraft"),
            Mc.minecraft(), "field_71441_e");
        return java.lang.reflect.Proxy.newProxyInstance(
            Actions.class.getClassLoader(),
            new Class<?>[] {senderIf},
            new java.lang.reflect.InvocationHandler() {
                @Override
                public Object invoke(Object proxy, java.lang.reflect.Method m,
                        Object[] args) {
                    String n = m.getName();
                    Class<?>[] p = m.getParameterTypes();
                    Class<?> r = m.getReturnType();
                    if (n.equals("toString") && p.length == 0) {
                        return "e2ee";
                    }
                    if (n.equals("hashCode") && p.length == 0) {
                        return System.identityHashCode(proxy);
                    }
                    if (n.equals("equals") && p.length == 1) {
                        return proxy == args[0];
                    }
                    // sendMessage(ITextComponent): the capture itself.
                    if (p.length == 1 && p[0].getName()
                            .equals("net.minecraft.util.text.ITextComponent")) {
                        out.append(unformatted(args[0])).append('\n');
                        return null;
                    }
                    // getName(): the only no-arg String on the interface.
                    if (p.length == 0 && r == String.class) {
                        return "e2ee";
                    }
                    // canUseCommand(int, String): ops-level, always true.
                    if (r == boolean.class) {
                        return Boolean.TRUE;
                    }
                    // getDisplayName(): fresh text component per call.
                    if (p.length == 0 && r.getName().equals(
                            "net.minecraft.util.text.ITextComponent")) {
                        try {
                            return textComponent("e2ee");
                        } catch (Exception e) {
                            return null;
                        }
                    }
                    // getServer(): the integrated server we run on.
                    if (p.length == 0 && r.getName()
                            .equals("net.minecraft.server.MinecraftServer")) {
                        return server;
                    }
                    // getEntityWorld(): server world 0 (console semantics —
                    // world commands like /give need a WorldServer, never
                    // the client copy). Client world is the fallback.
                    if (p.length == 0
                        && r.getName().equals("net.minecraft.world.World")) {
                        Object w = serverWorld(server);
                        return w != null ? w : clientWorld;
                    }
                    // getPosition()/getPositionVector(): the player's block
                    // (console uses spawn; nearest-player selectors need a
                    // real spot — with one player online both agree).
                    if (p.length == 0 && r.getName()
                            .equals("net.minecraft.util.math.BlockPos")) {
                        return playerBlockPos();
                    }
                    if (p.length == 0 && r.getName()
                            .equals("net.minecraft.util.math.Vec3d")) {
                        int[] b = playerBlock();
                        try {
                            return cls("net.minecraft.util.math.Vec3d")
                                .getConstructor(double.class, double.class, double.class)
                                .newInstance(b[0] + 0.5, b[1], b[2] + 0.5);
                        } catch (Exception e) {
                            return null;
                        }
                    }
                    if (r == void.class) {
                        return null;
                    }
                    if (!r.isPrimitive()) {
                        return null;
                    }
                    if (r == int.class || r == long.class
                        || r == short.class || r == byte.class) {
                        return 0;
                    }
                    if (r == double.class || r == float.class) {
                        return 0.0;
                    }
                    if (r == char.class) {
                        return (char) 0;
                    }
                    return null;
                }
            });
    }

    // Explicit world join over the socket: loads world now on the client
    // thread (idempotent: already-loaded/joining answer ok, no relaunch).
    // Empty text = resolve via the same chain as boot (file/env/prop).
    // Reply carries the folder used plus the join state machine state.
    static JsonObject join(final String text) throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                String folder = text != null && !text.trim().isEmpty()
                    ? text.trim() : AutoJoin.joinFolder();
                if (folder == null) {
                    return SocketServer.err("no world");
                }
                AutoJoin.Result r = AutoJoin.tryJoin(folder);
                if (!r.ok) {
                    JsonObject o = SocketServer.err(r.err);
                    o.addProperty("state", r.state);
                    return o;
                }
                JsonObject o = SocketServer.ok();
                o.addProperty("world", folder);
                o.addProperty("state", r.state);
                return o;
            }
        });
    }

    // pos + screen + inv in ONE Mc.sync snapshot: every field is read on
    // the client thread in a single hop, so no tick boundary can split
    // position from inventory (shape asserted by tests, same-tick read by
    // construction — the client thread cannot tick mid-Callable).
    static JsonObject state() throws Exception {
        return Mc.sync(new Callable<JsonObject>() {
            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public JsonObject call() throws Exception {
                Object p = Mc.player();
                double x = Mc.d(p, F_POSX);
                double y = Mc.d(p, F_POSY);
                double z = Mc.d(p, F_POSZ);
                float yaw = Mc.f(p, F_YAW);
                float pitch = Mc.f(p, F_PITCH);
                java.lang.reflect.Method gh = p.getClass().getMethod(M_GETHEALTH);
                float health = ((Number) gh.invoke(p)).floatValue();
                Object invPlayer = ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.entity.player.EntityPlayer"), p, "field_71071_by");
                List<Object> main = (List<Object>) ObfuscationReflectionHelper.getPrivateValue(
                    (Class) cls("net.minecraft.entity.player.InventoryPlayer"), invPlayer, F_MAININV);
                JsonObject pos = new JsonObject();
                pos.addProperty("x", x);
                pos.addProperty("y", y);
                pos.addProperty("z", z);
                pos.addProperty("yaw", yaw);
                pos.addProperty("pitch", pitch);
                pos.addProperty("health", health);
                JsonObject o = SocketServer.ok();
                o.add("pos", pos);
                o.addProperty("screen", Mc.screenName());
                JsonArray arr = new JsonArray();
                for (int i = 0; i < main.size(); i++) {
                    arr.add(slotJson(main.get(i)));
                }
                o.add("inv", arr);
                return o;
            }
        });
    }

    // One ItemStack as JsonElement (null element per empty slot).
    // Shared by inv()/winv()/state() so all report identical shapes.
    private static com.google.gson.JsonElement slotJson(Object stack) throws Exception {
        Method empty = stack.getClass().getMethod(M_ISEMPTY);
        if ((Boolean) empty.invoke(stack)) {
            return JsonNull.INSTANCE;
        }
        Object item = stack.getClass().getMethod(M_GETITEM).invoke(stack);
        Object rl = item.getClass().getMethod("getRegistryName").invoke(item);
        int count = ((Number) stack.getClass().getMethod(M_COUNT).invoke(stack)).intValue();
        int dmg = ((Number) stack.getClass().getMethod(M_DAMAGE).invoke(stack)).intValue();
        JsonObject o = new JsonObject();
        o.addProperty("id", String.valueOf(rl));
        o.addProperty("n", count);
        o.addProperty("dmg", dmg);
        return o;
    }
}
