import { holmAdjusted } from '../honesty/exact'

// The comparison core (the counted foundation, 2026-11-12; in shadow: nothing reads it yet). One way of comparing,
// one chance check and one list of standings for every association the app will say: "this went with that", never
// why. Two shapes of question: the outcome after occasions with a thing against occasions without it, and how often
// a thing happened in one cell of a split (a weekday, a check-in, a yes or no that came before) against the rest.
//
// Missing is unknown: an occasion the record cannot speak for is never passed in, so it is in neither side and in
// no denominator. The chance check is a permutation test whose labels are shuffled only among the occasions of the
// same short stretch of time, so a good or bad fortnight cannot pass for a pattern. Nothing here reads a clock, a
// screen or a store: the same code runs on the phone, in the Worker and in the stress harness.

/** Usable occasions needed on each side before anything is compared. */
export const MIN_SIDE = 8
/** For a "when" question: occurrences needed in all. */
export const MIN_OCCURRENCES = 5
/** The sizes worth saying: on the reading out of 100, on one reading in steps, and between two rates. */
export const WORTH_POINTS = 10
export const WORTH_STEPS = 0.4
export const WORTH_RATE = 0.15
/** The chance a difference must be under, on its own for a lead and after the family's correction for a pattern. */
export const ALPHA = 0.05
export const SHUFFLES = 2000
/** Labels are shuffled only among the occasions of the same stretch of this many days. */
export const STRETCH_DAYS = 14

export type Standing = 'tooFew' | 'noPattern' | 'lead' | 'pattern'
export type Direction = 'higher' | 'lower' | 'none'

/** One known occasion of a with-against-without comparison. */
export interface Point {
  /** The occasion's day, YYYY-MM-DD: the stretch of time it is shuffled within. */
  day: string
  /** Whether it carried the thing. */
  event: boolean
  /** The outcome read at the stated later slot. */
  outcome: number
  /** Where the occasion started, when the comparison is like for like: only occasions that started the same are set against each other. */
  band?: string
}

/** One known occasion of a "when" question. */
export interface CellPoint {
  day: string
  /** The cell of the split it falls in: a weekday, a check-in, a yes or no that came before. */
  cell: string
  /** Whether the thing happened at it. */
  happened: boolean
}

/** A small seeded generator, so a comparison's chance is the same every time it is drawn. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed from words: the comparison's own id and counts. */
export function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const dayNumber = (day: string): number => Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000)

/** The stretch each occasion falls in, counted in whole stretches from the earliest occasion's day. */
export function stretchesOf(days: readonly string[], length: number = STRETCH_DAYS): number[] {
  if (!days.length) return []
  const numbers = days.map(dayNumber)
  const first = Math.min(...numbers)
  return numbers.map((n) => Math.floor((n - first) / length))
}

/** The rows of each group, by the group's label, in first-seen order. */
function groups(labels: readonly (string | number)[]): number[][] {
  const by = new Map<string | number, number[]>()
  labels.forEach((l, i) => {
    const g = by.get(l)
    if (g) g.push(i)
    else by.set(l, [i])
  })
  return [...by.values()]
}

/**
 * The chance check. `flags` are the labels that are shuffled, `strata` the groups they are shuffled within, and
 * `measure` gives one number or several for an arrangement of the labels (a "when" question measures every cell at
 * once). For each measure: how often a shuffle gives a value at least as far from zero as the real one, in either
 * direction; the chance is that count plus one over the shuffles plus one. A measure stops being counted once
 * `stopAt` shuffles have reached it: by default 100 of 2,000, after which its chance is above 0.05 whatever the rest
 * would give, so its standing is the one a full run would reach. The first arrangement measured is the real one.
 */
export function permutationP(flags: readonly boolean[], strata: readonly number[][], measure: (flags: readonly boolean[]) => readonly number[], seed: number, shuffles: number = SHUFFLES, stopAt: number = Math.floor(ALPHA * (shuffles + 1))): number[] {
  const real = measure(flags).map(Math.abs)
  const reached = real.map(() => 0)
  const done = real.map(() => 0)
  const open = real.map(() => true)
  const next = seeded(seed)
  const work = [...flags]
  for (let s = 0; s < shuffles && open.some(Boolean); s++) {
    for (const rows of strata) {
      // Fisher and Yates, within the stratum.
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const a = work[rows[i]]
        work[rows[i]] = work[rows[j]]
        work[rows[j]] = a
      }
    }
    const got = measure(work)
    for (let k = 0; k < real.length; k++) {
      if (!open[k]) continue
      done[k]++
      if (Math.abs(got[k]) >= real[k] - 1e-12) reached[k]++
      if (reached[k] >= stopAt) open[k] = false
    }
  }
  return real.map((_, k) => (reached[k] + 1) / (done[k] + 1))
}

const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length

/**
 * With minus without. Like for like when the points carry a band: within each band present on both sides, weighted by
 * the smaller side, exactly as the app's like-for-like comparison has always been taken; null when no band is shared.
 * Without bands, the difference of the two means; null when a side is empty.
 */
export function difference(points: readonly Point[], events: readonly boolean[] = points.map((p) => p.event)): number | null {
  if (points.some((p) => p.band !== undefined)) {
    const bands = new Map<string, { a: number[]; b: number[] }>()
    points.forEach((p, i) => {
      const key = p.band ?? ''
      const cell = bands.get(key) ?? bands.set(key, { a: [], b: [] }).get(key)
      ;(events[i] ? cell?.a : cell?.b)?.push(p.outcome)
    })
    let sum = 0
    let weight = 0
    for (const { a, b } of bands.values()) {
      if (!a.length || !b.length) continue
      const w = Math.min(a.length, b.length)
      sum += w * (mean(a) - mean(b))
      weight += w
    }
    return weight > 0 ? sum / weight : null
  }
  const a = points.filter((_, i) => events[i]).map((p) => p.outcome)
  const b = points.filter((_, i) => !events[i]).map((p) => p.outcome)
  return a.length && b.length ? mean(a) - mean(b) : null
}

/** One comparison as the family reads it. */
export interface Compared {
  id: string
  /** Usable occasions with the thing, and without it (for a "when" cell: in the cell, and outside it). */
  n: number
  m: number
  /** The real difference: with minus without, or the cell's rate less the rest's; null when nothing can be compared. */
  diff: number | null
  /** Whether both sides have enough occasions to be compared at all. */
  enough: boolean
  /** The chance of a difference this large with nothing there; null when it was not tested. */
  p: number | null
  /** The size worth saying for this measure. */
  worth: number
}

/**
 * The outcome after occasions with a thing against occasions without it. `worth` is the size worth saying on the
 * outcome's own scale. Under the minimum on either side, or with nothing comparable, nothing is tested.
 */
export function compare(points: readonly Point[], opts: { id: string; worth: number; shuffles?: number; stopAt?: number }): Compared {
  const n = points.filter((p) => p.event).length
  const m = points.length - n
  const diff = difference(points)
  const enough = n >= MIN_SIDE && m >= MIN_SIDE && diff !== null
  if (!enough) return { id: opts.id, n, m, diff, enough: false, p: null, worth: opts.worth }
  const strata = groups(stretchesOf(points.map((p) => p.day)))
  const [p] = permutationP(points.map((x) => x.event), strata, (events) => [difference(points, events) ?? 0], seedOf(`${opts.id}|${n}|${m}`), opts.shuffles, opts.stopAt)
  return { id: opts.id, n, m, diff, enough: true, p, worth: opts.worth }
}

/** One cell of a "when" question: k of n in the cell, against the rest. */
export interface CellRate extends Compared {
  cell: string
  /** How many of the cell's known occasions carried the thing, and of the rest's. */
  k: number
  restK: number
}

/**
 * When is it most likely: for one thing and one split, each cell's "k of n" against all the other cells together.
 * `within` says what the labels are shuffled inside: the 14-day stretch for a weekday or a yes-or-no that came
 * before, the day itself for the check-ins of a day. A cell is tested only with enough occasions in it and outside
 * it, and enough occurrences in all.
 */
export function ratesBy(points: readonly CellPoint[], opts: { id: string; within: 'stretch' | 'day'; cells?: readonly string[]; shuffles?: number; stopAt?: number }): CellRate[] {
  const cells = opts.cells ?? [...new Set(points.map((p) => p.cell))].sort()
  const total = points.length
  const occurrences = points.filter((p) => p.happened).length
  const inCell = cells.map((c) => points.map((p) => p.cell === c))
  const sizes = inCell.map((flags) => flags.filter(Boolean).length)
  const rates = (happened: readonly boolean[]) =>
    inCell.map((flags, i) => {
      let k = 0
      let all = 0
      happened.forEach((h, row) => {
        if (!h) return
        all++
        if (flags[row]) k++
      })
      const n = sizes[i]
      return { k, restK: all - k, diff: n > 0 && total - n > 0 ? k / n - (all - k) / (total - n) : null }
    })
  const real = rates(points.map((p) => p.happened))
  const enough = cells.map((_, i) => sizes[i] >= MIN_SIDE && total - sizes[i] >= MIN_SIDE && occurrences >= MIN_OCCURRENCES && real[i].diff !== null)
  const tested = cells.map((_, i) => i).filter((i) => enough[i])
  let ps: number[] = []
  if (tested.length) {
    const strata = groups(opts.within === 'day' ? points.map((p) => p.day) : stretchesOf(points.map((p) => p.day)))
    ps = permutationP(points.map((p) => p.happened), strata, (happened) => { const r = rates(happened); return tested.map((i) => r[i].diff ?? 0) }, seedOf(`${opts.id}|${total}|${occurrences}`), opts.shuffles, opts.stopAt)
  }
  return cells.map((cell, i) => ({ id: `${opts.id}.${cell}`, cell, n: sizes[i], m: total - sizes[i], k: real[i].k, restK: real[i].restK, diff: real[i].diff, enough: enough[i], p: enough[i] ? ps[tested.indexOf(i)] : null, worth: WORTH_RATE }))
}

/** A comparison's standing among its family, with what the words need. */
export interface Stood {
  id: string
  standing: Standing
  direction: Direction
  /** The chance after the family's correction; null when it was not tested. */
  adjusted: number | null
  /** How many comparisons of the family were tested: the size the correction was made across, and the number said with a lead. */
  family: number
}

/**
 * The standings of a family: every comparison looked at to say one thing. The correction (Holm's, at 0.05) is made
 * across every comparison with enough occasions to be tested, whatever its size: one under the minimum is never
 * tested and cannot be a false pattern, and one left out for its size after its size was seen would make the
 * correction too light.
 */
export function standings(family: readonly Compared[]): Stood[] {
  const tested = family.filter((c) => c.enough && c.p !== null)
  const adjusted = holmAdjusted(tested.map((c) => c.p as number))
  return family.map((c) => {
    const direction: Direction = c.diff === null || c.diff === 0 ? 'none' : c.diff > 0 ? 'higher' : 'lower'
    const at = tested.indexOf(c)
    if (at < 0) return { id: c.id, standing: 'tooFew', direction, adjusted: null, family: tested.length }
    const p = c.p as number
    const big = Math.abs(c.diff as number) >= c.worth - 1e-9
    const standing: Standing = !big || p > ALPHA ? 'noPattern' : adjusted[at] > ALPHA ? 'lead' : 'pattern'
    return { id: c.id, standing, direction, adjusted: adjusted[at], family: tested.length }
  })
}
