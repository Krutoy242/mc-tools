package com.e2ee.agent;

import net.minecraftforge.fml.common.ObfuscationReflectionHelper;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

// Closed-loop head turn. A one-shot delta lands or not depending on frame
// timing (Display.update polls wipe accumulators; the turn may gate on
// inGameHasFocus while headless). So arm an absolute degree target and let
// every client tick compare with the live head and re-inject ONLY the
// remainder: no overshoot by construction, wipes just delay by a tick.
final class LookHold {
    private static boolean armed = false;
    private static double targetYaw;
    private static double targetPitch;
    private static float mult = 0.15f;
    private static int ticks = 0;

    static float sensitivityMult() throws Exception {
        Object mc = Mc.minecraft();
        Object gs = ObfuscationReflectionHelper.getPrivateValue(
            (Class) Class.forName("net.minecraft.client.Minecraft"), mc, "field_71474_y");
        float s = ((Number) ObfuscationReflectionHelper.getPrivateValue(
            (Class) Class.forName("net.minecraft.client.settings.GameSettings"),
            gs, "field_74341_c")).floatValue();
        float f = s * 0.6f + 0.2f;
        return f * f * f * 8.0f * 0.15f;
    }

    static float[] head() throws Exception {
        Object p = Mc.player();
        float yaw = ((Number) ObfuscationReflectionHelper.getPrivateValue(
            (Class) Mc.entityClass(), p, "field_70177_z")).floatValue();
        float pitch = ((Number) ObfuscationReflectionHelper.getPrivateValue(
            (Class) Mc.entityClass(), p, "field_70125_A")).floatValue();
        return new float[] {yaw, pitch};
    }

    static double wrap(double d) {
        while (d > 180.0) {
            d -= 360.0;
        }
        while (d < -180.0) {
            d += 360.0;
        }
        return d;
    }

    // Headless bypass: vanilla may ignore the mouse turn while the window
    // is unfocused (inGameHasFocus=false). Force the flag with a field
    // write — NOT setIngameFocus, so the OS mouse and grab state stay put.
    static void ensureFocus() {
        try {
            Object mc = Mc.minecraft();
            Boolean f = (Boolean) ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"), mc, "field_71415_G");
            if (!Boolean.TRUE.equals(f)) {
                ObfuscationReflectionHelper.setPrivateValue(
                    (Class) Class.forName("net.minecraft.client.Minecraft"),
                    mc, Boolean.TRUE, "field_71415_G");
            }
        } catch (Exception e) {
            AgentMod.LOG.warn("E2EE-AGENT focus failed: " + e);
        }
    }

    static void armDegrees(double dYaw, double dPitch) throws Exception {
        float[] h = head();
        mult = sensitivityMult();
        targetYaw = h[0] + dYaw;
        targetPitch = Math.max(-90.0, Math.min(90.0, h[1] + dPitch));
        ticks = 0;
        armed = true;
        ensureFocus();
    }

    static boolean armed() {
        return armed;
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.START || !armed) {
            return;
        }
        try {
            ensureFocus();
            float[] h = head();
            double remYaw = wrap(targetYaw - h[0]);
            double remPitch = targetPitch - h[1];
            if (Math.abs(remYaw) < 0.3 && Math.abs(remPitch) < 0.3) {
                armed = false;
                return;
            }
            if (++ticks > 25) {
                armed = false;
                return;
            }
            Class<?> mouse;
            try {
                mouse = Class.forName("org.lwjgl.input.Mouse");
            } catch (ClassNotFoundException ex) {
                mouse = Class.forName("org.lwjglx.input.Mouse");
            }
            Actions.lookDeltaInject(mouse,
                (float) (remYaw / mult), (float) (-remPitch / mult));
        } catch (Exception ex) {
            AgentMod.LOG.warn("E2EE-AGENT lookhold failed: " + ex);
            armed = false;
        }
    }
}
