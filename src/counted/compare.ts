import { holmAdjusted } from '../honesty/exact'

// The comparison core (the counted foundation, 2026-11-12; in shadow: nothing reads it yet). One way of comparing,
// one chance check and one list of standings for every association the app will say: "this went with that", never
// why. Two shapes of question: the outcome after occasions with a thing against occasions without it, and how often
// a thing happened in one cell of a split (a weekday, a check-in, a yes or no that came before) against the rest.
//
// Missing is unknown: an occasion the record cannot speak for is never passed in, so it is in neither side and in
// no denominator. The chance check is a permutation test whose labels are shuffled only among the occasions of the
// same short stretch of time, so a good or bad fortnight cannot pass for a pattern. A label the whole day shares
// (the weekday, what came before the day) belongs to the day: whole days change places, each keeping its check-ins
// together, so a thing that repeats within its day cannot pass for a weekday's. For with against without, a
// stretch's labels are turned round in their own order rather than dealt out afresh, so a streak stays a streak:
// seven evenings in a row that fell on one good week are one coincidence, not seven. And each arrangement's
// difference is read against its own spread, so one that leans on a few occasions cannot look larger than it is.
// Both were settled on the simulation's tuning seeds (stress/RESULTS-8.md). Nothing here reads a clock, a screen
// or a store: the same code runs on the phone, in the Worker and in the stress harness.

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
 * The chance check. `labels` are what is shuffled, `strata` the groups they are shuffled within, and `measure`
 * gives one number or several for an arrangement of the labels (a "when" question measures every cell at once).
 * For each measure: how often a shuffle gives a value at least as far from zero as the real one, in either
 * direction; the chance is that count plus one over the shuffles plus one. A measure stops being counted once
 * `stopAt` shuffles have reached it: by default 100 of 2,000, after which its chance is above 0.05 whatever the rest
 * would give, so its standing is the one a full run would reach. The first arrangement measured is the real one.
 * `how` says how a group's labels move: dealt out afresh ('shuffle'), or turned round ('turn'), every label moving
 * the same number of places along the group's own order, so labels that sat side by side still do.
 */
export function permutationP<T>(labels: readonly T[], strata: readonly (readonly number[])[], measure: (labels: readonly T[]) => readonly number[], seed: number, shuffles: number = SHUFFLES, stopAt: number = Math.floor(ALPHA * (shuffles + 1)), how: 'shuffle' | 'turn' = 'shuffle'): number[] {
  const real = measure(labels).map(Math.abs)
  const reached = real.map(() => 0)
  const done = real.map(() => 0)
  const open = real.map(() => true)
  const next = seeded(seed)
  const work = [...labels]
  for (let s = 0; s < shuffles && open.some(Boolean); s++) {
    for (const rows of strata) {
      if (how === 'turn') {
        const places = Math.floor(next() * rows.length)
        for (let i = 0; i < rows.length; i++) work[rows[i]] = labels[rows[(i + places) % rows.length]]
        continue
      }
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

/**
 * With minus without, for any arrangement of which occasions carried the thing. The points are laid out once, so a
 * chance check can measure two thousand arrangements without building anything; the sums run in the points' own
 * order and the bands in first-seen order, so every arrangement gives the number it always gave. With `scaled`, the
 * difference comes over the square root of what its spread is proportional to (the weights squared, times one over
 * each side's count, summed over the bands): the number the chance check ranks arrangements by.
 */
function differenceOf(points: readonly Point[]): (events: readonly boolean[], scaled?: boolean) => number | null {
  const rows = points.length
  const outcome = Float64Array.from(points, (p) => p.outcome)
  if (!points.some((p) => p.band !== undefined)) {
    return (events, scaled) => {
      let sumA = 0
      let sumB = 0
      let a = 0
      let b = 0
      for (let i = 0; i < rows; i++) {
        if (events[i]) {
          sumA += outcome[i]
          a++
        } else {
          sumB += outcome[i]
          b++
        }
      }
      if (!a || !b) return null
      return scaled ? (sumA / a - sumB / b) / Math.sqrt(1 / a + 1 / b) : sumA / a - sumB / b
    }
  }
  const bandIndex = new Map<string, number>()
  const band = Int32Array.from(points, (p) => {
    const key = p.band ?? ''
    return bandIndex.get(key) ?? bandIndex.set(key, bandIndex.size).size - 1
  })
  const bands = bandIndex.size
  const sumA = new Float64Array(bands)
  const sumB = new Float64Array(bands)
  const na = new Int32Array(bands)
  const nb = new Int32Array(bands)
  return (events, scaled) => {
    sumA.fill(0)
    sumB.fill(0)
    na.fill(0)
    nb.fill(0)
    for (let i = 0; i < rows; i++) {
      if (events[i]) {
        sumA[band[i]] += outcome[i]
        na[band[i]]++
      } else {
        sumB[band[i]] += outcome[i]
        nb[band[i]]++
      }
    }
    let sum = 0
    let weight = 0
    let spread = 0
    for (let b = 0; b < bands; b++) {
      if (!na[b] || !nb[b]) continue
      const w = Math.min(na[b], nb[b])
      sum += w * (sumA[b] / na[b] - sumB[b] / nb[b])
      weight += w
      spread += w * w * (1 / na[b] + 1 / nb[b])
    }
    if (!(weight > 0)) return null
    return scaled ? sum / Math.sqrt(spread) : sum / weight
  }
}

/**
 * With minus without. Like for like when the points carry a band: within each band present on both sides, weighted by
 * the smaller side, exactly as the app's like-for-like comparison has always been taken; null when no band is shared.
 * Without bands, the difference of the two means; null when a side is empty.
 */
export function difference(points: readonly Point[], events: readonly boolean[] = points.map((p) => p.event)): number | null {
  return differenceOf(points)(events)
}

/**
 * The same difference as the chance check ranks it: read against its own spread. An arrangement that puts the thing
 * on one occasion of a band and leaves ten without leans on that one occasion, and its difference is worth less
 * than the same difference from five against five.
 */
export function scaledDifference(points: readonly Point[], events: readonly boolean[] = points.map((p) => p.event)): number | null {
  return differenceOf(points)(events, true)
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
 * outcome's own scale. Under the minimum on either side, or with nothing comparable, nothing is tested. The chance
 * check turns each stretch's labels round in the order of their days, and ranks every arrangement by its difference
 * read against its own spread; the difference said is the plain one.
 */
export function compare(points: readonly Point[], opts: { id: string; worth: number; shuffles?: number; stopAt?: number }): Compared {
  const n = points.filter((p) => p.event).length
  const m = points.length - n
  const measure = differenceOf(points)
  const diff = measure(points.map((p) => p.event))
  const enough = n >= MIN_SIDE && m >= MIN_SIDE && diff !== null
  if (!enough) return { id: opts.id, n, m, diff, enough: false, p: null, worth: opts.worth }
  const strata = groups(stretchesOf(points.map((p) => p.day)))
  const number = points.map((x) => dayNumber(x.day))
  const inOrder = strata.map((rows) => [...rows].sort((a, b) => number[a] - number[b] || a - b))
  const [p] = permutationP(points.map((x) => x.event), inOrder, (events) => [measure(events, true) ?? 0], seedOf(`${opts.id}|${n}|${m}`), opts.shuffles, opts.stopAt, 'turn')
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
 * `within` says how the labels are shuffled. 'stretch' is for a label the whole day shares (the weekday, a yes or no
 * that came before the day): whole days change places inside the 14-day stretch, each keeping its occasions
 * together. 'day' is for the check-ins of a day: they are shuffled among themselves. A cell is tested only with
 * enough occasions in it and outside it, and enough occurrences in all.
 */
export function ratesBy(points: readonly CellPoint[], opts: { id: string; within: 'stretch' | 'day'; cells?: readonly string[]; shuffles?: number; stopAt?: number }): CellRate[] {
  const cells = opts.cells ?? [...new Set(points.map((p) => p.cell))].sort()
  const total = points.length
  const occurrences = points.filter((p) => p.happened).length
  const cellIndex = new Map(cells.map((c, i) => [c, i]))
  /** Each occasion's cell among those asked about; -1 for one that only counts toward the rest. */
  const at = points.map((p) => cellIndex.get(p.cell) ?? -1)
  const sizes = cells.map(() => 0)
  const ks = cells.map(() => 0)
  points.forEach((p, row) => {
    if (at[row] < 0) return
    sizes[at[row]]++
    if (p.happened) ks[at[row]]++
  })
  /** The cell's rate less the rest's, for k of n in the cell. */
  const gap = (k: number, n: number): number | null => (n > 0 && total - n > 0 ? k / n - (occurrences - k) / (total - n) : null)
  const real = cells.map((_, i) => gap(ks[i], sizes[i]))
  const enough = cells.map((_, i) => sizes[i] >= MIN_SIDE && total - sizes[i] >= MIN_SIDE && occurrences >= MIN_OCCURRENCES && real[i] !== null)
  const tested = cells.map((_, i) => i).filter((i) => enough[i])
  let ps: number[] = []
  if (tested.length) {
    const seed = seedOf(`${opts.id}|${total}|${occurrences}`)
    const n = cells.map(() => 0)
    const k = cells.map(() => 0)
    if (opts.within === 'day') {
      // The check-ins of a day, shuffled among themselves: every cell keeps its occasions, and what happened moves.
      const strata = groups(points.map((p) => p.day))
      ps = permutationP(points.map((p) => p.happened), strata, (happened) => {
        k.fill(0)
        for (let row = 0; row < total; row++) if (happened[row] && at[row] >= 0) k[at[row]]++
        return tested.map((i) => gap(k[i], sizes[i]) ?? 0)
      }, seed, opts.shuffles, opts.stopAt)
    } else {
      // Whole days change places: each day keeps its occasions and what happened at them, and takes another day's cell.
      const dayIndex = new Map<string, number>()
      const days: string[] = []
      const dayCell: number[] = []
      const dayN: number[] = []
      const dayK: number[] = []
      points.forEach((p, row) => {
        let d = dayIndex.get(p.day)
        if (d === undefined) {
          d = days.length
          dayIndex.set(p.day, d)
          days.push(p.day)
          dayCell.push(at[row])
          dayN.push(0)
          dayK.push(0)
        } else if (dayCell[d] !== at[row]) throw new Error(`a split shuffled by whole days needs one cell for each day: ${p.day}`)
        dayN[d]++
        if (p.happened) dayK[d]++
      })
      const strata = groups(stretchesOf(days))
      ps = permutationP(dayCell, strata, (cellOfDay) => {
        n.fill(0)
        k.fill(0)
        for (let d = 0; d < days.length; d++) {
          const c = cellOfDay[d]
          if (c < 0) continue
          n[c] += dayN[d]
          k[c] += dayK[d]
        }
        return tested.map((i) => gap(k[i], n[i]) ?? 0)
      }, seed, opts.shuffles, opts.stopAt)
    }
  }
  return cells.map((cell, i) => ({ id: `${opts.id}.${cell}`, cell, n: sizes[i], m: total - sizes[i], k: ks[i], restK: occurrences - ks[i], diff: real[i], enough: enough[i], p: enough[i] ? ps[tested.indexOf(i)] : null, worth: WORTH_RATE }))
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
