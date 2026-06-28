interface Ctx { debugText: string }

// Reachability failure: neither condition can ever match the current log.
export function isTestEnded(_ctx: Ctx): boolean {
  return false
}

export function isBugFound(_ctx: Ctx): boolean {
  return false
}
