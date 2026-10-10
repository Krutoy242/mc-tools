package com.e2ee.agent;

import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.FMLCommonHandler;
import net.minecraftforge.fml.relauncher.Side;

public class ClientProxy extends CommonProxy {
    private SocketServer socket;

    @Override
    public void init() {
        // Double guard: this class only loads on the client via @SidedProxy,
        // but never bind from a server thread under any circumstance.
        if (FMLCommonHandler.instance().getSide() != Side.CLIENT) {
            AgentMod.LOG.warn("E2EE-AGENT refusing to bind on non-client side");
            return;
        }
        socket = new SocketServer(6488);
        socket.start();
        AgentMod.LOG.info("E2EE-AGENT socket on 127.0.0.1:6488");
        MinecraftForge.EVENT_BUS.register(new RawHold());
        MinecraftForge.EVENT_BUS.register(new LookHold());
        MinecraftForge.EVENT_BUS.register(new CursorBot());
        MinecraftForge.EVENT_BUS.register(new AutoJoin());
        MinecraftForge.EVENT_BUS.register(new ScalarGuard());
        NoPause.apply();
        MinecraftForge.EVENT_BUS.register(new NoPause());
    }
}
