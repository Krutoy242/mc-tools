export function createAntilooped<T>(self: T, fn: (...args: any[]) => any) {
  return (antiloop = new Set<T>()) => {
    if (antiloop.has(self)) return 0
    antiloop.add(self)
    return fn()
  }
}
