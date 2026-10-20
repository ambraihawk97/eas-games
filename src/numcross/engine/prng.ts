/** Seeded xorshift32 PRNG — deterministic, reproducible puzzles */
export interface PRNG {
  next: () => number
  int: (a: number, b: number) => number
  pick: <T>(arr: T[]) => T
  shuffle: <T>(arr: T[]) => T[]
}

export function createPRNG(seed: number): PRNG {
  let s = ((seed ^ 0xdeadbeef) >>> 0) || 1

  const next = (): number => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }

  const int = (a: number, b: number): number =>
    Math.floor(next() * (b - a + 1)) + a

  const pick = <T>(arr: T[]): T =>
    arr[Math.floor(next() * arr.length)]

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = (0 | next() * (i + 1)) as number
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  return { next, int, pick, shuffle }
}
