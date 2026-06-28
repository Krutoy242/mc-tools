interface Ctx { debugText: string }

// Intentionally invalid: only exports isTestEnded, missing isBugFound.
export function isTestEnded(ctx: Ctx): boolean {
  return /BOOT_DONE/.test(ctx.debugText)
}
