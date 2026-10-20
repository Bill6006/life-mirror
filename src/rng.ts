// A random source and a small deterministic one for tests and reproducible draws. Moved from bandit.ts unchanged
// (2026-10-20) when the old engine was retired.

export type Rng = () => number

/** A small deterministic generator for tests. */
export function seeded(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
