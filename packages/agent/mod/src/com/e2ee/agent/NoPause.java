package com.e2ee.agent;

import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;
import net.minecraftforge.fml.common.ObfuscationReflectionHelper;

// Headless-stand invariant: the control machine is usually UNFOCUSED, and
// vanilla reopens the pause menu within a tick of every close while
// GameSettings.pauseOnLostFocus (the F3+P flag) is true. That silently eats
// movement and clicks, so the mod enforces false on boot and re-asserts it
// every 100 client ticks (self-heals a stray F3+P too). Test-stand only.
final class NoPause {
    private static final String F_SETTINGS = "field_71474_y";
    private static final String F_FLAG = "field_82881_y";

    private static int tick;

    static void apply() {
        try {
            Object mc = Mc.minecraft();
            // Resolved fresh every time (once per 100 ticks): if the game
            // ever swaps the GameSettings object, a cached one would write
            // the flag into a dead instance.
            Object gameSettings = ObfuscationReflectionHelper.getPrivateValue(
                (Class) Class.forName("net.minecraft.client.Minecraft"), mc, F_SETTINGS);
            if (gameSettings == null) {
                return;
            }
            Class<?> gsClass = Class.forName("net.minecraft.client.settings.GameSettings");
            Boolean cur = (Boolean) ObfuscationReflectionHelper.getPrivateValue(
                (Class) gsClass, gameSettings, F_FLAG);
            if (Boolean.TRUE.equals(cur)) {
                ObfuscationReflectionHelper.setPrivateValue(
                    (Class) gsClass, gameSettings, Boolean.FALSE, F_FLAG);
                AgentMod.LOG.info("E2EE-AGENT pauseOnLostFocus -> false");
            }
        } catch (Exception e) {
            AgentMod.LOG.warn("E2EE-AGENT nopause failed: " + e);
        }
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.START) {
            return;
        }
        if ((++tick % 100) != 0) {
            return;
        }
        apply();
    }
}
