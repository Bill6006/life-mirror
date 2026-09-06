import type { CheckIn } from './db'
import { readings, type ReadingId } from './readings'

// "Moves together": rank correlation between pairs of readings across the check-ins where
// both were answered. A calculation about co-movement only; it says nothing about cause.

/** Average ranks, so ties share a rank. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k].i] = rank
    i = j + 1
  }
  return out
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length
  if (n < 3 || ys.length !== n) return null
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  return pearson(ranks(xs), ranks(ys))
}

export interface Pair {
  a: ReadingId
  b: ReadingId
  rho: number
  n: number
}

/** Fewer shared check-ins than this and a pair is not shown at all. */
export const MIN_SHARED = 6

export function movesTogether(all: readonly CheckIn[], minN = MIN_SHARED): Pair[] {
  const ids = readings.map((r) => r.id)
  const pairs: Pair[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const xs: number[] = []
      const ys: number[] = []
      for (const c of all) {
        const a = c.answers[ids[i]]
        const b = c.answers[ids[j]]
        if (a !== undefined && b !== undefined) {
          xs.push(a)
          ys.push(b)
        }
      }
      if (xs.length < minN) continue
      const rho = spearman(xs, ys)
      if (rho === null) continue
      pairs.push({ a: ids[i], b: ids[j], rho, n: xs.length })
    }
  }
  return pairs.sort((p, q) => Math.abs(q.rho) - Math.abs(p.rho))
}
