package com.e2ee.agent;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetAddress;
import java.net.ServerSocket;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadFactory;

// Localhost line-JSON bridge. One command per connection, then close.
// Protocol v1: {"cmd":"ping"} -> {"ok":true}
//              {"cmd":"pos"}  -> {"ok":true,"x":..,"y":..,"z":..,
//                                 "yaw":..,"pitch":..,"health":..}
public class SocketServer {
    private final int port;

    public SocketServer(int port) {
        this.port = port;
    }

    public void start() {
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                serve();
            }
        }, "e2ee-agent-socket");
        t.setDaemon(true);
        t.start();
    }

    private void serve() {
        try {
            ServerSocket ss = new ServerSocket(port, 8, InetAddress.getByName("127.0.0.1"));
            ss.setReuseAddress(true);
            AgentMod.LOG.info("E2EE-AGENT serving on 127.0.0.1:" + port);
            // Bounded pool (daemon): a slow command (cmd waits up to 10s
            // on the server thread) must not head-of-line-block ping/pos
            // polling behind it — but a wedged client thread must fail
            // fast ("bridge overloaded"), not park unbounded threads.
            // Mc.sync hops every job onto the client thread, so concurrent
            // handlers are safe. Localhost only, ~1-2 concurrent live.
            java.util.concurrent.ThreadPoolExecutor pool =
                new java.util.concurrent.ThreadPoolExecutor(4, 8, 60,
                    java.util.concurrent.TimeUnit.SECONDS,
                    new ArrayBlockingQueue<Runnable>(16), new ThreadFactory() {
                        private int n;
                        @Override
                        public Thread newThread(Runnable r) {
                            Thread t = new Thread(r, "e2ee-agent-conn-" + (++n));
                            t.setDaemon(true);
                            return t;
                        }
                    }, new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
            while (true) {
                final Socket s = ss.accept();
                try {
                    pool.execute(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            handle(s);
                        } catch (Throwable e) {
                            // Throwable, not Exception: a
                            // NoClassDefFoundError-class failure once
                            // killed this thread and wedged the bridge.
                            AgentMod.LOG.warn("E2EE-AGENT conn failed: " + e);
                        } finally {
                            try {
                                s.close();
                            } catch (Exception ignored) {
                            }
                        }
                    }
                });
                } catch (java.util.concurrent.RejectedExecutionException full) {
                    // Pool + queue saturated: fail fast, keep the loop alive.
                    try {
                        Writer out = new OutputStreamWriter(s.getOutputStream(),
                            StandardCharsets.UTF_8);
                        out.write(GSON.toJson(err("bridge overloaded")) + "\n");
                        out.flush();
                    } catch (Exception ignored) {
                    } finally {
                        try {
                            s.close();
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        } catch (Throwable e) {
            AgentMod.LOG.error("E2EE-AGENT socket died: " + e);
        }
    }

    private void handle(Socket s) throws Exception {
        s.setSoTimeout(15000);
        BufferedReader in = new BufferedReader(new InputStreamReader(
            s.getInputStream(), StandardCharsets.UTF_8));
        String line = in.readLine();
        String reply;
        try {
            reply = dispatch(line == null ? "" : line);
        } catch (Throwable e) {
            reply = GSON.toJson(err(String.valueOf(e)));
        }
        Writer out = new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8);
        out.write(reply + "\n");
        out.flush();
    }

    private interface Handler {
        JsonElement run(JsonObject req) throws Exception;
    }

    static final Gson GSON = new Gson();

    static JsonObject ok() {
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        return o;
    }

    static JsonObject err(String e) {
        JsonObject o = new JsonObject();
        o.addProperty("ok", false);
        o.addProperty("err", e);
        return o;
    }

    // Missing key -> default; present-but-not-a-scalar -> bad arg (never
    // a silent 0/""/false that drives the game somewhere unintended).
    // Explicit isJsonPrimitive: Gson coerces some non-scalars instead of
    // throwing (observed: [1] as double passed), so the type gate is ours.
    private static String rs(JsonObject req, String key) {
        if (!req.has(key) || req.get(key).isJsonNull()) {
            return "";
        }
        if (!req.get(key).isJsonPrimitive()) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
        try {
            return req.get(key).getAsString();
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
    }

    private static double rn(JsonObject req, String key) {
        if (!req.has(key) || req.get(key).isJsonNull()) {
            return 0;
        }
        if (!req.get(key).isJsonPrimitive()) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
        try {
            return req.get(key).getAsDouble();
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
    }

    private static boolean rb(JsonObject req, String key) {
        if (!req.has(key) || req.get(key).isJsonNull()) {
            return false;
        }
        if (!req.get(key).isJsonPrimitive()) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
        try {
            return req.get(key).getAsBoolean();
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("bad arg: " + key);
        }
    }

    private static final Map<String, Handler> HANDLERS = handlers();

    private static Map<String, Handler> handlers() {
        Map<String, Handler> m = new HashMap<String, Handler>();
        m.put("ping", req -> ok());
        m.put("pos", req -> Mc.posJson());
        m.put("block", req -> Actions.block(
            (int) rn(req, "x"), (int) rn(req, "y"), (int) rn(req, "z")));
        m.put("guibtn", req -> Actions.guibtn(rs(req, "label")));
        m.put("fields", req -> Actions.fields(rs(req, "class")));
        m.put("methods", req -> Actions.methods(rs(req, "class")));
        m.put("use", req -> Actions.use(
            (int) rn(req, "x"), (int) rn(req, "y"), (int) rn(req, "z")));
        m.put("rawkey", req -> Actions.rawkey(
            (int) rn(req, "code"), rb(req, "down")));
        m.put("lookdelta", req -> Actions.lookdelta(
            (float) rn(req, "dx"), (float) rn(req, "dy")));
        m.put("mousebtn", req -> Actions.mousebtn(
            (int) rn(req, "button"), rb(req, "down")));
        m.put("close", req -> Actions.close());
        m.put("keybd", req -> Actions.keybd(
            (int) rn(req, "code"), rb(req, "down")));
        m.put("trace", req -> Actions.trace());
        m.put("nopause", req -> Actions.nopause());
        m.put("tickstate", req -> RawHold.tickState());
        m.put("cursor", req -> Actions.cursor(
            (int) rn(req, "x"), (int) rn(req, "y")));
        m.put("cursordelta", req -> Actions.cursordelta(
            (int) rn(req, "dx"), (int) rn(req, "dy")));
        m.put("cursoroff", req -> Actions.cursoroff());
        m.put("cursorhover", req -> Actions.cursorhover(
            (int) rn(req, "ticks")));
        m.put("cursorclick", req -> Actions.cursorclick(
            (int) rn(req, "button")));
        m.put("cursorstate", req -> Actions.cursorstate());
        m.put("cursorslot", req -> Actions.cursorslot());
        m.put("winv", req -> Actions.winv());
        m.put("shot", req -> Actions.shot());
        m.put("regdump", req -> Actions.regdump());
        m.put("stackname", req -> Actions.stackname(
            (int) rn(req, "slot")));
        m.put("cmd", req -> Actions.cmd(rs(req, "text")));
        m.put("state", req -> Actions.state());
        m.put("join", req -> Actions.join(rs(req, "world")));
        return java.util.Collections.unmodifiableMap(m);
    }

    private String dispatch(String line) throws Exception {
        JsonObject req = new JsonParser().parse(line).getAsJsonObject();
        String cmd = rs(req, "cmd");
        Handler h = HANDLERS.get(cmd);
        if (h == null) {
            return GSON.toJson(err("unknown cmd"));
        }
        try {
            return GSON.toJson(h.run(req));
        } catch (IllegalArgumentException e) {
            return GSON.toJson(err(e.getMessage()));
        }
    }
}
