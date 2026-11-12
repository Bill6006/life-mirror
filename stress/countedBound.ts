import { phi, qnorm } from './stats'

// The bounds the counted foundation's frozen criteria name (criteria 3 and 4; RESULTS-8.md says where they are kept): the most a test
// that keeps the standard's own terms could reach for one simulated person, at that person's own counts. Exact sums
// and normal areas: nothing here is simulated, and nothing here calls the comparison core. The standard's numbers
// are written as literals on purpose, so this file does not move if the core's constants ever do.

const ALPHA = 0.05
const MIN_SIDE = 8
const MIN_OCCURRENCES = 5
const WORTH_RATE = 0.15
const WORTH_POINTS = 10

const logFact: number[] = [0]
const lf = (n: number): number => {
  for (let i = logFact.length; i <= n; i++) logFact.push(logFact[i - 1] + Math.log(i))
  return logFact[n]
}
const logChoose = (n: number, k: number): number => lf(n) - lf(k) - lf(n - k)
const binom = (n: number, p: number, k: number): number => Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p))

/** Fisher's exact test, two-sided, for every table with these row sums and this column sum: the chance by the cell's count (every table no more likely than the one seen). */
function fisher(n1: number, n0: number, total: number): { lo: number; p: number[] } {
  const lo = Math.max(0, total - n0)
  const hi = Math.min(n1, total)
  const pmf: number[] = []
  for (let t = lo; t <= hi; t++) pmf.push(Math.exp(logChoose(n1, t) + logChoose(n0, total - t) - logChoose(n1 + n0, total)))
  return { lo, p: pmf.map((own) => Math.min(1, pmf.filter((q) => q <= own * (1 + 1e-7)).reduce((s, q) => s + q, 0))) }
}

const weekdayCache = new Map<string, number>()

/**
 * Criterion 3, for one person: the chance that Fisher's exact test, two-sided at 0.05 over `family` comparisons, with at
 * least 8 days a side, 5 occurrences and a difference of at least 0.15 seen, calls a rate of `raised` on `n1` days
 * against `base` on `n0` days.
 */
export function weekdayBound(n1: number, n0: number, family: number, base = 0.3, raised = 0.6): number {
  if (n1 < MIN_SIDE || n0 < MIN_SIDE || family < 1) return 0
  const key = `${n1}|${n0}|${family}|${base}|${raised}`
  const kept = weekdayCache.get(key)
  if (kept !== undefined) return kept
  const tables = new Map<number, { lo: number; p: number[] }>()
  let power = 0
  for (let x1 = 0; x1 <= n1; x1++) {
    const p1 = binom(n1, raised, x1)
    for (let x0 = 0; x0 <= n0; x0++) {
      const total = x1 + x0
      if (total < MIN_OCCURRENCES) continue
      if (Math.abs(x1 / n1 - x0 / n0) < WORTH_RATE) continue
      let f = tables.get(total)
      if (!f) {
        f = fisher(n1, n0, total)
        tables.set(total, f)
      }
      if (f.p[x1 - f.lo] <= ALPHA / family) power += p1 * binom(n0, base, x0)
    }
  }
  weekdayCache.set(key, power)
  return power
}

/**
 * Criterion 4, for one person: the chance that a two-sided z test with the spread known, at 0.05 over `family`
 * comparisons, with a difference of at least 10 points seen, calls a true difference of `effect` points at `n1`
 * evenings with the thing and `n0` without. Under 8 evenings on a side the chance is 0.
 */
export function meansBound(n1: number, n0: number, family: number, spread: number, effect: number): number {
  if (n1 < MIN_SIDE || n0 < MIN_SIDE || family < 1 || !(spread > 0)) return 0
  const se = spread * Math.sqrt(1 / n1 + 1 / n0)
  const bar = Math.max(WORTH_POINTS, qnorm(1 - ALPHA / family / 2) * se)
  return 1 - phi((bar - effect) / se) + phi((-bar - effect) / se)
}
