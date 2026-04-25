export function createAntilooped<T, R>(self: T, fn: (...args: any[]) => R) {
  return (antiloop = new Set<T>()): R | 0 => {
    if (antiloop.has(self)) return 0
    antiloop.add(self)
    return fn()
  }
}
