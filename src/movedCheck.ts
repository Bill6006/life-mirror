import { addDays, BLOCKS, type Block } from './blocks'
import type { Forecast, ForecastScore } from './db'

// Batch 3, item 7 (2026-11-21): did the challenger's adjustment help? Each forecast the challenger moves keeps the
// plain forecast it was moved from (`plain`); once its slot is scored the two are set side by side. At three looks
// fixed in advance the app reads them by a rule frozen before any real result was read, and acts on the verdict itself:
// "switch it off" stops the challenger from the day of reading on. Read from the stored forecasts and their scores
// alone, worked out afresh at every read, with nothing kept between reads, so no session and no person is needed for it
// to be read or acted on. The calculation is described in docs/forecast-check.md, which a test holds to these numbers.

/** The three looks: how many moved forecasts must be scored before each is read. There is never a fourth. */
export const CHECK_LOOKS = [40, 80, 120] as const
/** The least different days of the slots forecast that a look's moved forecasts must lie on. */
export const CHECK_MIN_DAYS = 10
/** How far the gain must stand clear of its own day-to-day spread to decide at the first two looks: the challenger's own margin (`CHALLENGER.minClear`). */
export const CHECK_CLEAR = 2.4

/** A moved forecast set beside the plain forecast it was moved from, once its slot was scored. */
export interface MovedForecast {
  day: string
  block: Block
  horizon: number
  scoredOn: string
  actual: number
  /** The distances from what was logged to the moved point and to the plain point. */
  miss: number
  plainMiss: number
  /** Whether what was logged fell inside the moved range, and inside the plain range. */
  held: boolean
  plainHeld: boolean
}

/** One look's reading. */
export interface Reading {
  look: 1 | 2 | 3
  /** The scoring day the look is cut at, and the day it is read from: the day after. */
  cut: string
  readOn: string
  n: number
  /** The different days of the slots forecast. */
  days: number
  held: number
  plainHeld: number
  /** The average misses, in points. */
  miss: number
  plainMiss: number
  /** The plain miss less the moved one, on average over the moved forecasts: above 0 where the moved ones came closer. */
  gain: number
  /** The day gains' sum over its own day-to-day spread, as the challenger's `clear`; null under two days or with no spread. */
  clear: number | null
}

export type Verdict = 'keep' | 'watch' | 'off'

export interface MovedCheck {
  /** Moved forecasts carrying their plain forecast, scored on a day before today. */
  scored: number
  /** The last look read; null before the first. */
  reading: Reading | null
  /** Null before the first look. Keep and off are final. */
  verdict: Verdict | null
  /** The count the next look is read at, before the first look and while watching; null once final. */
  next: number | null
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The plain forecast a row was moved from, where it carries a whole one. */
function plainOf(f: Forecast): { point: number; lo: number; hi: number } | null {
  const p = f.plain
  return p && typeof p === 'object' && finite(p.point) && finite(p.lo) && finite(p.hi) ? p : null
}

const blockOrder = (b: Block): number => BLOCKS.indexOf(b)

/**
 * The moved forecasts that carry their plain forecast, each set beside it, scored on a day before `today`, in the order
 * they were scored (then by the day forecast, the check-in and the horizon). A row moved before the plain forecast was
 * kept is not read; nor is one whose slot is not scored, or was scored today.
 */
export function movedForecasts(forecasts: readonly Forecast[], scores: readonly ForecastScore[], today: string): MovedForecast[] {
  const scoreOf = new Map(scores.map((s) => [`${s.day}|${s.block}|${s.horizon}`, s]))
  const out: MovedForecast[] = []
  for (const f of forecasts) {
    if (!finite(f.adj) || f.adj === 0 || !finite(f.point) || !finite(f.lo) || !finite(f.hi)) continue
    const plain = plainOf(f)
    if (!plain) continue
    const s = scoreOf.get(`${f.day}|${f.block}|${f.horizon}`)
    if (!s || typeof s.scoredOn !== 'string' || !(s.scoredOn < today) || !finite(s.actual)) continue
    const actual = s.actual
    out.push({
      day: f.day,
      block: f.block,
      horizon: f.horizon,
      scoredOn: s.scoredOn,
      actual,
      miss: Math.abs(actual - f.point),
      plainMiss: Math.abs(actual - plain.point),
      held: f.lo <= actual && actual <= f.hi,
      plainHeld: plain.lo <= actual && actual <= plain.hi,
    })
  }
  return out.sort((a, b) => (a.scoredOn !== b.scoredOn ? (a.scoredOn < b.scoredOn ? -1 : 1) : a.day !== b.day ? (a.day < b.day ? -1 : 1) : blockOrder(a.block) - blockOrder(b.block) || a.horizon - b.horizon))
}

/**
 * A look at `count`: every moved forecast scored on or before the first scoring day by which at least `count` are
 * scored, on at least `CHECK_MIN_DAYS` different days of the slots forecast, and none scored later; null until then.
 * The rows come in the order they were scored, so a scoring day's end is where the next row's scoring day differs.
 */
export function lookAt(rows: readonly MovedForecast[], count: number): { cut: string; rows: MovedForecast[] } | null {
  const days = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    days.add(rows[i].day)
    const dayEnds = i + 1 === rows.length || rows[i + 1].scoredOn !== rows[i].scoredOn
    if (dayEnds && i + 1 >= count && days.size >= CHECK_MIN_DAYS) return { cut: rows[i].scoredOn, rows: rows.slice(0, i + 1) }
  }
  return null
}

/** One look's reading of its moved forecasts: the counts, the average misses, the gain and its clearance. */
export function readingOf(rows: readonly MovedForecast[], look: 1 | 2 | 3, cut: string): Reading {
  const n = rows.length
  const byDay = new Map<string, number>()
  let total = 0
  for (const r of rows) {
    const g = r.plainMiss - r.miss
    total += g
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + g)
  }
  // The challenger's own clearance (`runChallenger`): the day gains' sum over the square root of their count times their variance.
  const dayGains = [...byDay.values()]
  let clear: number | null = null
  if (dayGains.length >= 2) {
    const mean = total / dayGains.length
    const spread = Math.sqrt((dayGains.reduce((s, g) => s + (g - mean) ** 2, 0) / (dayGains.length - 1)) * dayGains.length)
    clear = spread > 0 ? total / spread : null
  }
  const sum = (f: (r: MovedForecast) => number): number => rows.reduce((s, r) => s + f(r), 0)
  return {
    look,
    cut,
    readOn: addDays(cut, 1),
    n,
    days: dayGains.length,
    held: rows.filter((r) => r.held).length,
    plainHeld: rows.filter((r) => r.plainHeld).length,
    miss: n ? sum((r) => r.miss) / n : 0,
    plainMiss: n ? sum((r) => r.plainMiss) / n : 0,
    gain: n ? total / n : 0,
    clear,
  }
}

/**
 * A look's verdict, by the rule frozen on 2026-11-21. At the first two looks: keep it at a clearance of 2.4 or more,
 * switch it off at −2.4 or less, and otherwise keep watching. At the third: keep it where the moved forecasts came closer
 * on average (a gain above 0), and otherwise switch it off.
 */
export function verdictOf(r: Pick<Reading, 'look' | 'gain' | 'clear'>): Verdict {
  if (r.look === 3) return r.gain > 0 ? 'keep' : 'off'
  if (r.clear !== null && r.clear >= CHECK_CLEAR) return 'keep'
  if (r.clear !== null && r.clear <= -CHECK_CLEAR) return 'off'
  return 'watch'
}

/** The check as it stands on `today`: the looks read in turn until one decides. Keep and off are final: no later look is read. */
export function movedCheck(forecasts: readonly Forecast[], scores: readonly ForecastScore[], today: string): MovedCheck {
  const rows = movedForecasts(forecasts, scores, today)
  let reading: Reading | null = null
  for (let k = 0; k < CHECK_LOOKS.length; k++) {
    const look = lookAt(rows, CHECK_LOOKS[k])
    if (!look) return { scored: rows.length, reading, verdict: reading ? 'watch' : null, next: CHECK_LOOKS[k] }
    reading = readingOf(look.rows, (k + 1) as 1 | 2 | 3, look.cut)
    const verdict = verdictOf(reading)
    if (verdict !== 'watch') return { scored: rows.length, reading, verdict, next: null }
  }
  // Unreachable: the third look always decides.
  return { scored: rows.length, reading, verdict: 'watch', next: null }
}

/** Whether the check has switched the challenger off: no forecast written from the day of that reading on is moved. */
export const checkStopsChallenger = (c: MovedCheck): boolean => c.verdict === 'off'
