declare module 'fast-levenshtein' {
  const levenshtein: {
    get: (a: string, b: string, options?: { useCollator?: boolean }) => number
  }
  export = levenshtein
}
