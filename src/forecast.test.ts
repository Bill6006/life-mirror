import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './blocks'
import type { CheckIn, Forecast } from './db'
import { BACKTEST_DAYS, backtest, chooseModel, dayBeside, earlyWarning, errorBand, flatWeek, forecastsDue, horizonBand, loggedDays, lowestAhead, predict, scoresDue, tellsWeekdaysApart, valuesByKey, visibleBefore, weekAheadRows } from './forecast'
import { slotKey } from './learning'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000, extras })

const TODAY = '2026-09-30'
/** Twenty-one days: mornings low, afternoons middle, evenings high, so each block has its own level. */
const record: CheckIn[] = []
for (let back = 21; back >= 1; back--) {
  const day = addDays(TODAY, -back)
  record.push(ci(day, 'morning', 2), ci(day, 'afternoon', 3), ci(day, 'evening', 4))
}

describe('the forecast models', () => {
  const values = valuesByKey(record)

  it('reads the record as one value per fully logged slot, and counts logged days', () => {
    // Every reading at one position scores 50 when three read up and three read down.
    expect(values.get(slotKey(addDays(TODAY, -1), 'evening'))).toBe(50)
    expect(loggedDays(values)).toBe(21)
    expect(loggedDays(valuesByKey([]))).toBe(0)
  })

  it('forecasts each slot from the record strictly before its day, by each model', () => {
    for (const model of ['sameBlock', 'weekdayBlock', 'lastValue', 'blend'] as const) {
      expect(predict(model, values, TODAY, 'morning')).toBeCloseTo(50, 5)
    }
    expect(predict('sameBlock', valuesByKey(record.slice(0, 6)), TODAY, 'morning')).toBeNull()
  })

  it('backtests every model on past days and names the one that would have scored best', () => {
    const b = backtest('sameBlock', values, TODAY)
    expect(b.n).toBeGreaterThan(30)
    expect(b.mae).toBeCloseTo(0, 5)
    const chosen = chooseModel(values, TODAY)
    expect(chosen).not.toBeNull()
    expect(chosen?.backtests).toHaveLength(4)
    expect(chooseModel(valuesByKey(record.slice(0, 3)), TODAY)).toBeNull()
  })

  it('draws the range from the 20th to the 80th of the past errors', () => {
    expect(errorBand([-10, -5, 0, 5, 10])).toEqual({ lo: -10, hi: 5 })
    expect(errorBand([])).toEqual({ lo: 0, hi: 0 })
  })
})

describe('forecasts as records', () => {
  const values = valuesByKey(record)
  const chosen = chooseModel(values, TODAY)!

  it('writes today and the week ahead once, and never a slot already logged or already forecast', () => {
    const due = forecastsDue(chosen, values, [], TODAY, new Set())
    // Today's three blocks at horizon 0 and seven days at horizons 1 to 7.
    expect(due.filter((f) => f.horizon === 0)).toHaveLength(3)
    expect(due.filter((f) => f.horizon === 7)).toHaveLength(3)
    expect(due).toHaveLength(24)
    for (const f of due) {
      expect(f.madeOn).toBe(TODAY)
      expect(f.lo).toBeLessThanOrEqual(f.point)
      expect(f.hi).toBeGreaterThanOrEqual(f.point)
    }
    // Rewriting is impossible: the same call with those forecasts in place writes nothing.
    expect(forecastsDue(chosen, values, due, TODAY, new Set())).toHaveLength(0)
    // A slot already logged today is never forecast after the fact.
    const withMorning = valuesByKey([...record, ci(TODAY, 'morning', 3)])
    const later = forecastsDue(chooseModel(withMorning, TODAY)!, withMorning, [], TODAY, new Set())
    expect(later.some((f) => f.day === TODAY && f.block === 'morning')).toBe(false)
  })

  it('keeps to today alone between seven and fourteen days of record, and nothing before seven', () => {
    const ten = valuesByKey(record.slice(-30))
    const c = chooseModel(ten, TODAY)!
    const due = forecastsDue(c, ten, [], TODAY, new Set())
    expect(due.every((f) => f.horizon === 0)).toBe(true)
    const six = valuesByKey(record.slice(-18))
    expect(forecastsDue(c, six, [], TODAY, new Set())).toHaveLength(0)
  })

  it('carries the what-if line from the days no move was done in that block', () => {
    const done = new Set(record.slice(-15).map((c) => slotKey(c.day, c.block)))
    const due = forecastsDue(chosen, values, [], TODAY, done)
    expect(due[0].whatIf).not.toBeNull()
    const allDone = new Set(record.map((c) => slotKey(c.day, c.block)))
    expect(forecastsDue(chosen, values, [], TODAY, allDone)[0].whatIf).toBeNull()
  })

  it('scores a forecast once its slot is logged, never a slot that stays unlogged, and never twice', () => {
    const yesterday = addDays(TODAY, -1)
    const f: Forecast = { day: yesterday, block: 'evening', horizon: 1, madeOn: addDays(TODAY, -2), model: 'sameBlock', point: 50, lo: 45, hi: 55, whatIf: null }
    const unlogged: Forecast = { ...f, block: 'morning', day: addDays(TODAY, 3) }
    const scores = scoresDue([f, unlogged], values, [], TODAY)
    expect(scores).toHaveLength(1)
    expect(scores[0]).toMatchObject({ day: yesterday, block: 'evening', actual: 50, error: 0, hit: true, scoredOn: TODAY })
    expect(scoresDue([f, unlogged], values, scores, TODAY)).toHaveLength(0)
    const miss = scoresDue([{ ...f, point: 70, lo: 60, hi: 80 }], values, [], TODAY)[0]
    expect(miss.hit).toBe(false)
    expect(miss.error).toBe(-20)
  })

  it('sets yesterday beside what happened', () => {
    const yesterday = addDays(TODAY, -1)
    const forecasts: Forecast[] = ['morning', 'afternoon', 'evening'].map((block) => ({ day: yesterday, block: block as Forecast['block'], horizon: 1, madeOn: addDays(TODAY, -2), model: 'sameBlock', point: 48, lo: 40, hi: 56, whatIf: null }))
    expect(dayBeside(forecasts, values, yesterday)).toEqual({ expected: 48, lo: 40, hi: 56, actual: 50, blocks: 3, hit: true })
    expect(dayBeside(forecasts, values, addDays(TODAY, 4))).toBeNull()
  })
})

describe('early warning', () => {
  it('says a stretch is starting when four of the last six logged blocks read under the low band, and not before', () => {
    const values = valuesByKey(record)
    expect(earlyWarning(values, () => 40, TODAY)).toMatchObject({ under: 0, of: 6, warning: false })
    expect(earlyWarning(values, () => 60, TODAY)).toMatchObject({ under: 6, of: 6, warning: true })
    const mixed = new Map(values)
    let n = 0
    for (const key of [...mixed.keys()].sort().reverse()) {
      if (n++ < 4) mixed.set(key, 30)
    }
    expect(earlyWarning(mixed, () => 40, TODAY)).toMatchObject({ under: 4, of: 6, warning: true })
    expect(earlyWarning(values, () => null, TODAY)).toMatchObject({ of: 0, warning: false })
  })
})

describe('the lowest day ahead', () => {
  it('is every day at the smallest expected reading, skipping days with no forecast, and none when none has one', () => {
    expect(lowestAhead([{ expected: 52 }, { expected: null }, { expected: 43 }, { expected: 57 }], 'weekdayBlock')).toEqual([2])
    expect(lowestAhead([{ expected: null }, { expected: null }], 'weekdayBlock')).toEqual([])
    expect(lowestAhead([], 'blend')).toEqual([])
    // Two days at the lowest are both the lowest: marking only the first would say it was lower than its equal.
    expect(lowestAhead([{ expected: 40 }, { expected: 52 }, { expected: 40 }], 'blend')).toEqual([0, 2])
  })

  it('marks no day when no day reads lower than another, as when all seven read 69 (truth audit, 2026-09-24)', () => {
    const alike = Array.from({ length: 7 }, () => ({ expected: 69 }))
    expect(lowestAhead(alike, 'weekdayBlock')).toEqual([])
    expect(lowestAhead([{ expected: 55 }, { expected: null }], 'blend')).toEqual([])
  })

  it('marks no day for a model blind to weekdays: a point between its days is its window’s edge or rounding, not the day', () => {
    const rows = [69, 69, 68, 69, 69, 69, 69].map((expected) => ({ expected }))
    expect(lowestAhead(rows, 'sameBlock')).toEqual([])
    expect(lowestAhead(rows, 'lastValue')).toEqual([])
    expect(lowestAhead(rows, 'weekdayBlock')).toEqual([2])
    expect(tellsWeekdaysApart('sameBlock')).toBe(false)
    expect(tellsWeekdaysApart('lastValue')).toBe(false)
    expect(tellsWeekdaysApart('weekdayBlock')).toBe(true)
    expect(tellsWeekdaysApart('blend')).toBe(true)
  })
})

describe('why the week ahead can read the same seven times (truth audit, 2026-09-24)', () => {
  const isMonday = (day: string) => new Date(`${day}T12:00:00`).getDay() === 1
  /** Five weeks at one level with day-to-day noise and no weekday in it: a fixed pseudo-random draw. */
  const steady = new Map<string, number>()
  let seed = 11
  for (let back = 35; back >= 1; back--) {
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      seed = (seed * 48271) % 2147483647
      steady.set(slotKey(addDays(TODAY, -back), block), 69 + (seed % 13) - 6)
    }
  }
  /** Five weeks with a Monday dip every week, the rest level: a pattern a weekday model can see. */
  const dip = new Map<string, number>()
  for (let back = 35; back >= 1; back--) {
    const day = addDays(TODAY, -back)
    for (const block of ['morning', 'afternoon', 'evening'] as const) dip.set(slotKey(day, block), isMonday(day) ? 30 : 70)
  }
  const aheadOf = (values: Map<string, number>) => {
    const chosen = chooseModel(values, TODAY)!
    const rows = weekAheadRows(forecastsDue(chosen, values, [], TODAY, new Set()), TODAY)
    return { chosen, rows }
  }

  it('with no weekday in the record, a weekday-blind model wins a day ahead, and its seven days come out alike with none marked', () => {
    const { chosen, rows } = aheadOf(steady)
    expect(tellsWeekdaysApart(chosen.model)).toBe(false)
    const mae = (m: string) => chosen.backtests.find((b) => b.model === m)?.mae as number
    for (const other of ['weekdayBlock', 'blend'] as const) expect(mae(chosen.model)).toBeLessThan(mae(other))
    const values = rows.map((r) => r.expected as number)
    expect(values.every((v) => v !== null)).toBe(true)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
    expect(lowestAhead(rows, chosen.model)).toEqual([])
    // Said as one level, from the days' own values, with their own ranges near and far (the final checklist, item 3).
    const flat = flatWeek(rows, chosen.model)
    expect(flat).toMatchObject({ why: 'blind', level: Math.round(values.reduce((s, v) => s + v, 0) / values.length) })
    expect(flat?.near).toEqual({ lo: rows[0].lo, hi: rows[0].hi })
    expect(flat?.far).toEqual({ lo: rows[6].lo, hi: rows[6].hi })
  })

  it('shares one baseline: each day’s forecast differs from tomorrow’s only by the oldest days its four weeks drop, under a point', () => {
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      const tomorrow = predict('sameBlock', steady, addDays(TODAY, 1), block) as number
      for (let h = 2; h <= 7; h++) expect(Math.abs((predict('sameBlock', steady, addDays(TODAY, h), block) as number) - tomorrow)).toBeLessThan(1)
    }
  })

  it('with a weekly dip in the record, a weekday model wins, the days ahead differ, and the dip day is the one marked', () => {
    const { chosen, rows } = aheadOf(dip)
    expect(tellsWeekdaysApart(chosen.model)).toBe(true)
    const monday = rows.findIndex((r) => isMonday(r.day))
    expect(rows[monday].expected as number).toBeLessThan(rows[(monday + 1) % 7].expected as number)
    expect(lowestAhead(rows, chosen.model)).toEqual([monday])
  })

  it('draws each day’s range from its own distance: tomorrow’s from errors a day out, a week out from errors a week out', () => {
    const chosen = chooseModel(steady, TODAY)!
    const due = forecastsDue(chosen, steady, [], TODAY, new Set())
    for (const h of [1, 7]) {
      const band = horizonBand(chosen, steady, TODAY, h)
      const f = due.find((x) => x.horizon === h && x.block === 'evening')!
      const p = predict(chosen.model, steady, f.day, 'evening') as number
      expect(f.lo).toBe(Math.max(0, Math.min(100, Math.round(p + band.lo))))
      expect(f.hi).toBe(Math.max(0, Math.min(100, Math.round(p + band.hi))))
    }
    expect(backtest(chosen.model, steady, TODAY, BACKTEST_DAYS, 7).n).toBeGreaterThanOrEqual(5)
  })

  it('waits for fourteen days that each have a complete check-in, not fourteen days on the calendar', () => {
    // Every other day logged: twenty-six days on the calendar, thirteen with a check-in, and no week ahead.
    const sparse = new Map([...steady].filter(([k]) => {
      const back = daysBetween(k.slice(0, 10), TODAY)
      return back <= 26 && back % 2 === 0
    }))
    expect(loggedDays(sparse)).toBe(13)
    const c = chooseModel(sparse, TODAY)!
    expect(forecastsDue(c, sparse, [], TODAY, new Set()).every((f) => f.horizon === 0)).toBe(true)
    const fourteen = new Map([...steady].filter(([k]) => {
      const back = daysBetween(k.slice(0, 10), TODAY)
      return back <= 28 && back % 2 === 0
    }))
    expect(loggedDays(fourteen)).toBe(14)
    expect(forecastsDue(chooseModel(fourteen, TODAY)!, fourteen, [], TODAY, new Set()).some((f) => f.horizon === 7)).toBe(true)
  })
})

describe('ranges by horizon, and the week ahead', () => {
  /** Twenty-eight days rising a point and a half a day, every block alike: a forecast made further out is further off. */
  const trend = new Map<string, number>()
  for (let back = 28; back >= 1; back--) {
    const day = addDays(TODAY, -back)
    for (const block of ['morning', 'afternoon', 'evening'] as const) trend.set(slotKey(day, block), 30 + (28 - back) * 1.5)
  }

  it('sees the record only as it stood that many days before', () => {
    expect(visibleBefore(trend, addDays(TODAY, -8)).size).toBe(21 * 3)
    const seven = backtest('lastValue', trend, TODAY, BACKTEST_DAYS, 7)
    const one = backtest('lastValue', trend, TODAY)
    expect(seven.horizon).toBe(7)
    expect(one.horizon).toBe(1)
    expect(seven.mae as number).toBeGreaterThan(one.mae as number)
  })

  it('gives a day seven out a range no narrower than tomorrow’s, and writes each day’s forecasts on its own band', () => {
    const chosen = chooseModel(trend, TODAY)!
    const near = horizonBand(chosen, trend, TODAY, 1)
    const far = horizonBand(chosen, trend, TODAY, 7)
    expect(far.hi - far.lo).toBeGreaterThanOrEqual(near.hi - near.lo)
    const due = forecastsDue(chosen, trend, [], TODAY, new Set())
    const width = (h: number) => {
      const f = due.find((x) => x.horizon === h && x.block === 'morning')!
      return f.hi - f.lo
    }
    expect(width(7)).toBeGreaterThanOrEqual(width(1))
    // Too few far-out errors, and the one-step band stands in.
    const short = new Map([...trend].filter(([k]) => k.slice(0, 10) >= addDays(TODAY, -8)))
    const c2 = chooseModel(short, TODAY)!
    expect(horizonBand(c2, short, TODAY, 7)).toEqual(horizonBand(c2, short, TODAY, 1))
  })

  it('reads the week ahead as the mean of each day’s blocks at that horizon, a gap where none was made', () => {
    const f = (day: string, block: Forecast['block'], horizon: number, point: number): Forecast => ({ day, block, horizon, madeOn: TODAY, model: 'sameBlock', point, lo: point - 10, hi: point + 10, whatIf: null })
    const rows = weekAheadRows([f(addDays(TODAY, 1), 'morning', 1, 40), f(addDays(TODAY, 1), 'evening', 1, 60), f(addDays(TODAY, 2), 'morning', 1, 99), f(addDays(TODAY, 3), 'morning', 3, 55)], TODAY)
    expect(rows).toHaveLength(7)
    expect(rows[0]).toEqual({ day: addDays(TODAY, 1), expected: 50, lo: 40, hi: 60 })
    // A forecast for that day made at another horizon is not that day's row.
    expect(rows[1]).toEqual({ day: addDays(TODAY, 2), expected: null, lo: null, hi: null })
    expect(rows[2]).toMatchObject({ expected: 55, lo: 45, hi: 65 })
    expect(rows[6].expected).toBeNull()
  })
})

describe('the week ahead said as one level when its days carry no meaningful difference (the final checklist, item 3)', () => {
  const row = (expected: number | null, lo = 60, hi = 76) => ({ expected, lo: expected === null ? null : lo, hi: expected === null ? null : hi })
  it('says one level for a weekday-blind model, and for a weekday model whose days sit within a point', () => {
    expect(flatWeek([row(68), row(68), row(69, 58, 78)], 'sameBlock')).toEqual({ why: 'blind', level: 68, near: { lo: 60, hi: 76 }, far: { lo: 58, hi: 78 } })
    expect(flatWeek([row(68), row(69), row(68)], 'weekdayBlock')).toMatchObject({ why: 'none', level: 68 })
  })
  it('keeps the day-by-day chart when a weekday model sees days that differ, and says nothing without a model or days', () => {
    expect(flatWeek([row(75), row(25), row(75)], 'weekdayBlock')).toBeNull()
    expect(flatWeek([row(68), row(70), row(68)], 'blend')).toBeNull()
    expect(flatWeek([row(68), row(68)], null)).toBeNull()
    expect(flatWeek([row(null), row(68)], 'sameBlock')).toBeNull()
  })
})
