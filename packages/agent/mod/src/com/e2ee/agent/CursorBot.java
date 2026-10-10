package com.e2ee.agent;

import net.minecraftforge.client.event.GuiScreenEvent;
import net.minecraftforge.client.event.RenderGameOverlayEvent;
import net.minecraftforge.client.event.RenderTooltipEvent;
import net.minecraftforge.fml.common.ObfuscationReflectionHelper;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

// The bot's own visible cursor. The user's OS mouse is NEVER touched
// (no setCursorPosition, ever): the virtual position lives in scaled GUI
// coords (y-down, same space as GuiScreen), and while hover-hold is armed
// each client tick injects an addMoveEvent steering vanilla's Mouse.getX/Y
// to the virtual pos — so real hover highlights, tooltips and button
// events happen there through the genuine event path. Rendered as a
// magenta crosshair on top of the HUD and of any open GuiScreen.
final class CursorBot {
    static int sx = -1;
    static int sy = -1;
    static boolean visible = false;
    static int hoverTicks = 0;

    private static final int COLOR = 0xFFFF00FF;

    // {scaledW, scaledH, displayW, displayH}.
    static int[] scaled() throws Exception {
        Object mc = Mc.minecraft();
        Class<?> mcClass = Class.forName("net.minecraft.client.Minecraft");
        Object sr = Class.forName("net.minecraft.client.gui.ScaledResolution")
            .getConstructor(mcClass).newInstance(mc);
        int sw = ((Number) sr.getClass().getMethod("func_78326_a").invoke(sr)).intValue();
        int sh = ((Number) sr.getClass().getMethod("func_78328_b").invoke(sr)).intValue();
        int dw = ((Number) ObfuscationReflectionHelper.getPrivateValue(
            (Class) mcClass, mc, "field_71443_c")).intValue();
        int dh = ((Number) ObfuscationReflectionHelper.getPrivateValue(
            (Class) mcClass, mc, "field_71440_d")).intValue();
        return new int[] {sw, sh, dw, dh};
    }

    static Class<?> mouseClass() throws Exception {
        try {
            return Class.forName("org.lwjgl.input.Mouse");
        } catch (ClassNotFoundException e) {
            return Class.forName("org.lwjglx.input.Mouse");
        }
    }

    // Steer vanilla's Mouse position to the virtual pos. addMoveEvent
    // takes an ABSOLUTE display-px position, Y-DOWN (it flips by display
    // height internally) — NOT a delta. latestX/Y update synchronously,
    // x/y (what the GUI reads) on event consume, hence the hover-hold.
    // The OS cursor does not move; the next OS poll snaps vanilla back,
    // which is why hover-hold re-steers every tick while armed.
    static void moveNow() throws Exception {
        if (sx < 0 || sy < 0) {
            return;
        }
        int[] s = scaled();
        double wantX = (double) sx * s[2] / s[0];
        double wantY = (double) sy * s[3] / s[1];
        mouseClass().getMethod("addMoveEvent", double.class, double.class)
            .invoke(null, wantX, wantY);
    }

    static com.google.gson.JsonObject stateJson() throws Exception {
        Class<?> m = mouseClass();
        int mx = ((Number) m.getMethod("getX").invoke(null)).intValue();
        int my = ((Number) m.getMethod("getY").invoke(null)).intValue();
        com.google.gson.JsonObject o = SocketServer.ok();
        o.addProperty("visible", visible);
        o.addProperty("vx", sx);
        o.addProperty("vy", sy);
        o.addProperty("mx", mx);
        o.addProperty("my", my);
        o.addProperty("hoverTicks", hoverTicks);
        return o;
    }

    private static void drawCrosshair() {
        if (!visible || sx < 0 || sy < 0) {
            return;
        }
        try {
            Class<?> gui = Class.forName("net.minecraft.client.gui.Gui");
            java.lang.reflect.Method rect = gui.getMethod("func_73734_a",
                int.class, int.class, int.class, int.class, int.class);
            rect.invoke(null, sx - 5, sy, sx + 6, sy + 1, COLOR);
            rect.invoke(null, sx, sy - 5, sx + 1, sy + 6, COLOR);
        } catch (Exception e) {
            AgentMod.LOG.warn("E2EE-AGENT cursor draw failed: " + e);
        }
    }

    @SubscribeEvent
    public void onOverlay(RenderGameOverlayEvent.Post e) {
        drawCrosshair();
    }

    @SubscribeEvent
    public void onGuiDraw(GuiScreenEvent.DrawScreenEvent.Post e) {
        drawCrosshair();
    }

    // Tooltips (and container layers) draw AFTER DrawScreenEvent.Post, so a
    // hovered stack would bury the crosshair. GuiUtils posts Color /
    // PostBackground / PostText per tooltip (Post itself is abstract and is
    // never posted) — PostText is the topmost hook that really fires.
    @SubscribeEvent
    public void onTipText(RenderTooltipEvent.PostText e) {
        drawCrosshair();
    }

    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.START || hoverTicks <= 0) {
            return;
        }
        try {
            moveNow();
        } catch (Exception ex) {
            AgentMod.LOG.warn("E2EE-AGENT cursor steer failed: " + ex);
        }
        hoverTicks--;
    }
}
