import { describe, expect, it } from 'vitest'
import { addDays } from './blocks'
import type { CheckIn, Forecast } from './db'
import { BACKTEST_DAYS, backtest, chooseModel, dayBeside, earlyWarning, errorBand, forecastsDue, horizonBand, loggedDays, lowestAhead, predict, scoresDue, valuesByKey, visibleBefore, weekAheadRows } from './forecast'
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
  it('is the smallest expected reading, skips days with no forecast, and is -1 when none has one', () => {
    expect(lowestAhead([{ expected: 52 }, { expected: null }, { expected: 43 }, { expected: 57 }])).toBe(2)
    expect(lowestAhead([{ expected: null }, { expected: null }])).toBe(-1)
    expect(lowestAhead([])).toBe(-1)
    // A tie keeps the first of them, so the chart never jumps between equals.
    expect(lowestAhead([{ expected: 40 }, { expected: 40 }])).toBe(0)
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
