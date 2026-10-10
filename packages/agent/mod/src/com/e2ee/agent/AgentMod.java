package com.e2ee.agent;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.Mod.EventHandler;
import net.minecraftforge.fml.common.SidedProxy;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.event.FMLPreInitializationEvent;
import org.apache.logging.log4j.Logger;

@Mod(
    modid = AgentMod.MODID,
    name = AgentMod.NAME,
    version = AgentMod.VERSION,
    acceptableRemoteVersions = "*",
    clientSideOnly = true
)
public class AgentMod {
    public static final String MODID = "e2eeagent";
    public static final String NAME = "E2EE Client Agent";
    public static final String VERSION = "0.2";

    public static Logger LOG;

    @SidedProxy(
        clientSide = "com.e2ee.agent.ClientProxy",
        serverSide = "com.e2ee.agent.ServerProxy"
    )
    public static CommonProxy proxy;

    @EventHandler
    public void preInit(FMLPreInitializationEvent event) {
        LOG = event.getModLog();
        LOG.info("E2EE-AGENT preInit");
    }

    @EventHandler
    public void init(FMLInitializationEvent event) {
        LOG.info("E2EE-AGENT init done");
        proxy.init();
    }
}
