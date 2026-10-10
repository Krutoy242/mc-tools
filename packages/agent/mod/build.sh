#!/usr/bin/env bash
# Build e2ee-agent WITHOUT Gradle: plain javac against the Forge universal jar.
# Only Forge API is referenced, so no deobfuscated Minecraft jar is needed.
# Usage: bash build.sh [--install]   (--install copies the jar into the pack mods/)
set -euo pipefail
MODDIR="$(cd "$(dirname "$0")" && pwd)"
# Prism libraries dir: override with PRISM_LIBS. Default is the standard
# Windows PrismLauncher data dir (no absolute user paths elsewhere).
PL="${PRISM_LIBS:-$APPDATA/PrismLauncher/libraries}"
FORGE_JAR="$PL/net/minecraftforge/forge/1.12.2-14.23.5.2860/forge-1.12.2-14.23.5.2860-universal.jar"
LOG4J_JAR="$PL/org/apache/logging/log4j/log4j-api/2.17.1/log4j-api-2.17.1.jar"
# Gson ships with Minecraft (vanilla lib) — compile against Prism's copy,
# never vendored into our jar; at runtime it resolves from the game classpath.
GSON_JAR="$PL/com/google/code/gson/gson/2.8.0/gson-2.8.0.jar"
OUT="$MODDIR/out"
CLS="$OUT/classes"
JAR="$OUT/e2ee-agent-0.1.jar"

rm -rf "$CLS"
mkdir -p "$CLS"
# NOTE: javac is a Windows exe: classpath separator is ';', forward slashes OK.
# find runs inside src so paths are relative (absolute win paths get mangled).
# -d/-cp go through cygpath -w: MSYS silent-converts /d/... and classes land
# in the wrong tree otherwise.
CP_W="$(cygpath -w "$FORGE_JAR");$(cygpath -w "$LOG4J_JAR");$(cygpath -w "$GSON_JAR")"
CLS_W="$(cygpath -w "$CLS")"
(cd "$MODDIR/src" && javac --release 8 -cp "$CP_W" -d "$CLS_W" $(find . -name '*.java'))
cp "$MODDIR/mcmod.info" "$CLS/mcmod.info"
# NOTE: jar.exe parses absolute /d/... paths as flags — relative output only.
(cd "$CLS" && jar cf ../e2ee-agent-0.1.jar .)
echo "BUILT: $JAR ($(stat -c %s "$JAR") bytes)"

if [ "${1:-}" = "--install" ]; then
  cp "$JAR" "$MODDIR/../../../../mods/e2ee-agent.jar"
  echo "INSTALLED: $MODDIR/../../../../mods/e2ee-agent.jar"
fi
