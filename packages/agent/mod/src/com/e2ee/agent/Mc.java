package com.e2ee.agent;

import java.lang.reflect.Method;
import java.util.concurrent.Callable;
import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;

import net.minecraftforge.fml.common.ObfuscationReflectionHelper;

// All net.minecraft access: prod runtime only, SRG names as strings.
// Class names (net.minecraft.*) are stable; member names come from
// MCP stable_39. No static MC refs, so plain javac stays working.
final class Mc {
    private Mc() {
    }

    // SRG names (stable_39): Minecraft.getMinecraft / .addScheduledTask /
    // .player / Entity.posX|posY|posZ / rotationYaw|rotationPitch / getHealth
    private static final String M_GETMINECRAFT = "func_71410_x";
    private static final String M_ADDSCHEDULED = "func_152344_a";
    private static final String F_PLAYER = "field_71439_g";
    private static final String F_POSX = "field_70165_t";
    private static final String F_POSY = "field_70163_u";
    private static final String F_POSZ = "field_70161_v";
    private static final String F_YAW = "field_70177_z";
    private static final String F_PITCH = "field_70125_A";
    private static final String M_GETHEALTH = "func_110143_aJ";

    private static Class<?> minecraftClass;
    private static Class<?> entityClass;
    private static Class<?> livingClass;
    private static Object minecraft;
    private static Method addScheduledTask;

    static synchronized Object minecraft() throws Exception {
        if (minecraft != null) {
            return minecraft;
        }
        minecraftClass = Class.forName("net.minecraft.client.Minecraft");
        // Declaring classes: leaf lookup misses inherited fields.
        entityClass = Class.forName("net.minecraft.entity.Entity");
        livingClass = Class.forName("net.minecraft.entity.EntityLivingBase");
        minecraft = minecraftClass.getMethod(M_GETMINECRAFT).invoke(null);
        addScheduledTask = minecraftClass.getMethod(M_ADDSCHEDULED, Runnable.class);
        return minecraft;
    }

    static Class<?> entityClass() throws Exception {
        minecraft();
        return entityClass;
    }

    // Run job on the client thread, wait for the result (5s max).
    static <T> T sync(Callable<T> job) throws Exception {
        Object mc = minecraft();
        FutureTask<T> task = new FutureTask<T>(job);
        addScheduledTask.invoke(mc, task);
        return task.get(5, TimeUnit.SECONDS);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    static Object player() throws Exception {
        Object mc = minecraft();
        // Raw Class: T infers to Object, no cast maze.
        Object p = ObfuscationReflectionHelper.getPrivateValue(
            (Class) minecraftClass, mc, F_PLAYER);
        if (p == null) {
            throw new IllegalStateException("no player (main menu?)");
        }
        return p;
    }

    static double d(Object o, String srg) {
        Object v = ObfuscationReflectionHelper.getPrivateValue(
            (Class) entityClass, o, srg);
        return ((Number) v).doubleValue();
    }

    static float f(Object o, String srg) {
        Object v = ObfuscationReflectionHelper.getPrivateValue(
            (Class) entityClass, o, srg);
        return ((Number) v).floatValue();
    }

    // {"x":..,"y":..,"z":..,"yaw":..,"pitch":..,"health":..,"screen":..} on client thread.
    // screen = simple class name of the open GuiScreen, or "none".
    static JsonObject posJson() throws Exception {
        return sync(new Callable<JsonObject>() {
            @Override
            public JsonObject call() throws Exception {
                Object p = player();
                JsonObject o = SocketServer.ok();
                o.addProperty("x", d(p, F_POSX));
                o.addProperty("y", d(p, F_POSY));
                o.addProperty("z", d(p, F_POSZ));
                o.addProperty("yaw", f(p, F_YAW));
                o.addProperty("pitch", f(p, F_PITCH));
                Method gh = livingClass.getMethod(M_GETHEALTH);
                o.addProperty("health", ((Number) gh.invoke(p)).floatValue());
                o.addProperty("screen", screenName());
                return o;
            }
        });
    }

    static String screenName() throws Exception {
        Object mc = minecraft();
        Object screen = ObfuscationReflectionHelper.getPrivateValue(
            (Class) minecraftClass, mc, "field_71462_r");
        if (screen == null) {
            return "none";
        }
        String name = screen.getClass().getName();
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1) : name;
    }
}
