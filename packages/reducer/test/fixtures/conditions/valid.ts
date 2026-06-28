interface Ctx { debugText: string, elapsed: number }

export function isTestEnded(ctx: Ctx): boolean {
  return /MixinService .+ was successfully booted/.test(ctx.debugText) || ctx.elapsed > 120_000
}

export function isBugFound(ctx: Ctx): boolean {
  return /Enqueued coremod CrashAssistantEntrypoint/.test(ctx.debugText)
}
