package com.e2ee.agent;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;

// Auto-dismiss the Scalar/Fugue "Your pack may crash without these mods"
// warning screen if it ever appears as a GuiScreen, so an unattended
// (reducer-driven) boot never stalls on it.
//
// LIMITATION (verified against cleanroom-0.6.11-alpha.jar): the boot-time
// prompt is NOT a GuiScreen. It fires from the FMLClientHandler constructor
// via SplashProgress.confirm(), before any @Mod code or event handler
// exists — this guard cannot catch that path. The reliable fix is the
// reducer-side flag flip (B:DISABLE_PATCH_MOD_CHECK=true while Fugue/Scalar
// are absent). This handler is defense in depth for any GuiScreen-form
// warning and stays narrowly matched so it can never close a real screen.
final class ScalarGuard {
    // SRG name (stable_39): Minecraft.displayGuiScreen.
    private static final String M_DISPLAY_GUI = "func_147108_a";

    private static final String[] CLASS_HINTS = {
        "scalar",
        "patchmodpresent",
        "patchmod",
    };

    private static final String[] TEXT_HINTS = {
        "may crash without these mods",
        "press any key to continue",
    };

    private static final Set<String> announced = new HashSet<String>();

    @SubscribeEvent
    public void onGui(GuiOpenEvent e) {
        Object gui;
        try {
            gui = e.getClass().getMethod("getGui").invoke(e);
        } catch (Exception ex) {
            return;
        }
        if (gui == null) {
            return;
        }
        String className = gui.getClass().getName().toLowerCase();
        boolean match = false;
        for (String hint : CLASS_HINTS) {
            if (className.contains(hint)) {
                match = true;
                break;
            }
        }
        if (!match && screenTextMatches(gui)) {
            match = true;
        }
        if (!match) {
            return;
        }
        dismiss(gui);
    }

    // Best-effort: any String field of the screen holding the warning text.
    private static boolean screenTextMatches(Object gui) {
        try {
            for (Class<?> c = gui.getClass(); c != null; c = c.getSuperclass()) {
                for (Field f : c.getDeclaredFields()) {
                    if (f.getType() != String.class) {
                        continue;
                    }
                    f.setAccessible(true);
                    Object v = f.get(gui);
                    if (!(v instanceof String)) {
                        continue;
                    }
                    String text = ((String) v).toLowerCase();
                    for (String hint : TEXT_HINTS) {
                        if (text.contains(hint)) {
                            return true;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            // Reflection probe only — never fail the GUI open path.
        }
        return false;
    }

    private static void dismiss(Object gui) {
        String name = gui.getClass().getName();
        try {
            Object mc = Mc.minecraft();
            Method display = null;
            for (Method m : mc.getClass().getMethods()) {
                if (m.getName().equals(M_DISPLAY_GUI) && m.getParameterTypes().length == 1) {
                    display = m;
                    break;
                }
            }
            if (display == null) {
                AgentMod.LOG.warn("E2EE-AGENT scalar guard: no displayGuiScreen, screen stays: " + name);
                return;
            }
            display.invoke(mc, new Object[] { null });
            // GuiOpenEvent fires on the client thread: this close is immediate.
            if (announced.add(name)) {
                AgentMod.LOG.info("E2EE-AGENT auto-dismissed Scalar warning screen: " + name);
            }
        } catch (Exception ex) {
            AgentMod.LOG.warn("E2EE-AGENT scalar guard failed on " + name + ": " + ex);
        }
    }
}
