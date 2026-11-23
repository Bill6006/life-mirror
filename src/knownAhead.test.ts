import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS, type Block } from './blocks'
import { copy } from './copy'
import { awayShaped, contextFromWeek, type CheckIn, type DayContext, type Forecast } from './db'
import { errorBand, HORIZON, LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY, LEVEL_WEEKDAY_WEATHER, predict, valuesByKey, visibleBefore } from './forecast'
import { fChance, gateOf, WEEK, type DayMiss } from './levelWeekday'
import { gateOver, heldOpen, KNOWN_AHEAD_ON, KNOWN_AHEAD_WAYS, knownAheadOn, knownAheadReader, knownAheadRecordOf, kindOfDay, kindOfWeekday, measureOfState, MEASURES, rowsWithKnownAhead, sameKindAs, setKnownAheadForTests, slopeTest, STAGE_C, trustOf, wayOfState, type KnownAheadDay, type KnownAheadRecord, type KnownAheadState } from './knownAhead'
import { bySunshine, inTwoReadings, KNOWN_TODAY, movedOffice, standIn, thinned, TWO_READINGS, twoReadingsWobble, type StandIn } from './knownAheadTesting'
import { weekdayOf } from './counted/occasions'
import { slotKey } from './observe'
import { DEFAULT_SETTINGS, type Settings, type Weekday } from './settings'

// Stage C of the week ahead, moved into the app number for number (Stage C-A, 2026-11-22): its numbers and its switch,
// its test over the weekdays that have their days, its slope test, the readings' term, the weather's term, the hold, the
// ranges, what the reader reads and what it never reads, the record it is given from the app's own days, and the rows
// the writer adds. Hand-worked days and stand-in records only; Stage C's switch is off. The reader beside the
// simulation's own tracker, on the verdict's people, is stress/stageCReaderCheck.ts.

afterEach(() => setKnownAheadForTests(null))

const T = KNOWN_TODAY
const recordOf = (s: StandIn, over: Partial<Parameters<typeof knownAheadRecordOf>[0]> = {}): KnownAheadRecord =>
  knownAheadRecordOf({ values: valuesByKey(s.checkins), checkins: s.checkins, days: s.days, week: s.week, depth: 'full', retired: [], weights: null, ...over })
/** The same-block way's forecast from the record before the day of writing. */
const flatOf = (rec: KnownAheadRecord, today: string, day: string, block: Block): number | null => predict('sameBlock', visibleBefore(rec.values as Map<string, number>, addDays(today, -1)), day, block)
const once = <X>(f: () => X): (() => X) => {
  let kept: { v: X } | null = null
  return () => (kept ??= { v: f() }).v
}
const TWO = once(() => standIn({ steps: inTwoReadings, wobble: twoReadingsWobble }))
const SUN = once(() => standIn({ steps: bySunshine(), weather: true }))
const ALL = once(() => standIn({ steps: (_d, w) => TWO_READINGS[w] }))
const NONE = once(() => standIn({}))
const moved = (since: number): StandIn => standIn(movedOffice(addDays(T, -since)))
/** The runner given its turn: a test that builds several readers in a row lets it answer between them. */
const pause = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0))

describe('Stage C’s numbers and its switch', () => {
  it('keeps the numbers its verdict was read on, and the level-plus-weekday way’s own', () => {
    expect(STAGE_C).toEqual({ readingChance: 0.000005, readingShrink: 2, reset: true, minWeekdays: 5, weatherChance: 0.0001, weatherShrink: 2, weatherWindow: 180, weatherLevel: 28, minPairs: 28, eventChance: 0, eventShrink: 2 })
    expect(WEEK).toEqual({ window: 180, chance: 0.000001, minDays: 4, hold: 28, shrink: 2 })
    expect(MEASURES).toEqual(['sunshine', 'rain', 'high'])
    expect(KNOWN_AHEAD_WAYS).toEqual([LEVEL_WEEKDAY, LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY_WEATHER])
  })

  it('is switched on in the code (the owner’s word of 2026-11-23), and a test can set it either way and back', () => {
    expect(KNOWN_AHEAD_ON).toBe(true)
    expect(knownAheadOn()).toBe(true)
    setKnownAheadForTests(false)
    expect(knownAheadOn()).toBe(false)
    setKnownAheadForTests(null)
    expect(knownAheadOn()).toBe(true)
  })

  it('writes no rows where it is not in use', () => {
    const r = knownAheadReader(recordOf(NONE()), T)
    expect(r.state().inUse).toBe(false)
    expect(r.rows()).toBeNull()
    // The probe: where it is in use, it writes.
    expect(knownAheadReader(recordOf(TWO()), T).rows()?.size).toBeGreaterThan(20)
  }, 60_000)

  it('has no recurring events’ term: a chance for one is refused', () => {
    expect(() => knownAheadReader(recordOf(NONE()), T, { ...STAGE_C, eventChance: 0.01 })).toThrow('not built')
    expect(() => knownAheadReader(recordOf(NONE()), T, STAGE_C)).not.toThrow()
  }, 60_000)
})

// Hand-worked days: four of each weekday (three where a weekday is short), each weekday's miss its effect at a scale, plus a small fixed wobble.
const EFFECT = [3, -9, -4, 0, 0, 4, 7]
const WOBBLE = [-1, 0.5, 1, -0.5]
function handDays(scale: number, short: readonly number[] = []): DayMiss[] {
  const out: DayMiss[] = []
  for (let j = 0; j < 4; j++) for (let w = 0; w < 7; w++) if (!(short.includes(w) && j === 3)) out.push({ weekday: w, miss: scale * EFFECT[w] + WOBBLE[(w + j) % 4] + 0.37 })
  return out
}
/** The F over the weekdays that have their least days, worked by hand: each such weekday's average less the average over their days. */
function byHand(days: readonly DayMiss[], has: readonly number[]) {
  const used = days.filter((d) => has.includes(d.weekday))
  const k = has.length
  const mean = (w: number) => used.filter((d) => d.weekday === w).reduce((a, d) => a + d.miss, 0) / used.filter((d) => d.weekday === w).length
  const grand = used.reduce((a, d) => a + d.miss, 0) / used.length
  const between = has.reduce((a, w) => a + used.filter((d) => d.weekday === w).length * (mean(w) - grand) ** 2, 0) / (k - 1)
  const inside = used.reduce((a, d) => a + (d.miss - mean(d.weekday)) ** 2, 0) / (used.length - k)
  const f = between / inside
  return { f, chance: fChance(f, k - 1, used.length - k), offset: [0, 1, 2, 3, 4, 5, 6].map((w) => (has.includes(w) ? mean(w) - grand : 0)) }
}

describe('the test over the weekdays that have their days (gateOver)', () => {
  it('with all seven weekdays is the level-plus-weekday way’s own test, number for number', () => {
    for (const scale of [0, 0.05, 1]) {
      const days = handDays(scale)
      expect(gateOver(days, WEEK, STAGE_C.minWeekdays)).toEqual(gateOf(days, WEEK))
    }
    expect(gateOver(handDays(1), WEEK, 5).open).toBe(true)
  })

  it('with five or six runs the same F over those weekdays alone, and a weekday left out takes no shift', () => {
    for (const short of [[3], [3, 4]]) {
      const days = handDays(1, short)
      const has = [0, 1, 2, 3, 4, 5, 6].filter((w) => !short.includes(w))
      const g = gateOver(days, WEEK, 5)
      const hand = byHand(days, has)
      expect(g.open).toBe(true)
      expect(g.f as number).toBeCloseTo(hand.f, 9)
      expect(g.chance as number).toBeCloseTo(hand.chance, 12)
      for (const w of short) expect(g.shift[w]).toBe(0)
      for (const w of has) expect(g.shift[w]).toBeCloseTo(Math.max(0, 1 - WEEK.shrink / hand.f) * hand.offset[w], 9)
      expect(g.shift.filter((s, w) => !short.includes(w) && s !== 0).length).toBeGreaterThan(3)
    }
  })

  it('is closed with fewer weekdays than it needs: under five, or under the number asked', () => {
    const closed = { open: false, f: null, chance: null, shift: [0, 0, 0, 0, 0, 0, 0] }
    expect(gateOver(handDays(1, [2, 3, 4]), WEEK, 5)).toEqual(closed)
    expect(gateOver(handDays(1, [3, 4]), WEEK, 6)).toEqual(closed)
    // The probe: five weekdays run.
    expect(gateOver(handDays(1, [3, 4]), WEEK, 5).open).toBe(true)
  })
})

describe('the slope test', () => {
  it('gives the slope, its squared t on the degrees of freedom given, and its chance', () => {
    const s = slopeTest(10, 5, 10, 8) as { slope: number; t2: number; chance: number }
    expect(s.slope).toBe(0.5)
    expect(s.t2).toBeCloseTo((0.25 * 10) / (7.5 / 8), 12)
    expect(s.chance).toBeCloseTo(fChance(s.t2, 1, 8), 12)
    expect(slopeTest(10, 5, 10, 0)).toBeNull()
    expect(slopeTest(0, 5, 10, 8)).toBeNull()
    expect(slopeTest(10, 10, 10, 8)).toBeNull()
  })
})

describe('the readings’ term', () => {
  it('is in use where a reading’s own test of its weekdays is held and the score’s is not: here mood’s and energy’s', () => {
    const r = knownAheadReader(recordOf(TWO()), T)
    expect(r.state()).toEqual({ inUse: true, score: false, readings: [true, true, false, false, false, false], weather: [false, false, false] })
    expect(r.opens().score).toBe(false)
    expect(wayOfState(r.state())).toBe(LEVEL_READINGS)
  }, 60_000)

  it('takes each reading’s own misses against its own same-block forecast, its own test and its shift, number for number', () => {
    const rec = recordOf(TWO())
    const r = knownAheadReader(rec, T)
    const numbers = { ...WEEK, chance: STAGE_C.readingChance, shrink: STAGE_C.readingShrink }
    // Each reading's test worked out here from the record: its points less its own same-block forecast, a day's misses averaged.
    const gates = rec.readings.map((series) => {
      const days: DayMiss[] = []
      for (let back = WEEK.window; back >= 1; back--) {
        const x = addDays(T, -back)
        const got = BLOCKS.map((b) => {
          const a = series.get(slotKey(x, b))
          const p = a === undefined ? null : predict('sameBlock', series, x, b)
          return a === undefined || p === null ? null : a - p
        }).filter((m): m is number => m !== null)
        if (got.length) days.push({ weekday: weekdayOf(x), miss: got.reduce((s, v) => s + v, 0) / got.length })
      }
      return gateOver(days, numbers, STAGE_C.minWeekdays)
    })
    const held = r.state().readings
    expect(held.filter(Boolean).length).toBe(2)
    for (let h = 1; h <= HORIZON; h++)
      for (const block of BLOCKS) {
        const day = addDays(T, h)
        let v = 0
        held.forEach((on, k) => {
          if (on) v += rec.share(k, block) * gates[k].shift[weekdayOf(day)]
        })
        expect(r.forecast(day, block)).toBeCloseTo((flatOf(rec, T, day, block) as number) + v, 9)
      }
  }, 60_000)

  it('lays each reading’s shift at its share of the score: twice the share, twice what is added', () => {
    const rec = recordOf(TWO())
    const once1 = knownAheadReader(rec, T)
    const twice = knownAheadReader({ ...rec, share: (r, b) => 2 * rec.share(r, b) }, T)
    let moved = 0
    for (let h = 1; h <= HORIZON; h++)
      for (const block of BLOCKS) {
        const day = addDays(T, h)
        const flat = flatOf(rec, T, day, block) as number
        const a = (once1.forecast(day, block) as number) - flat
        expect((twice.forecast(day, block) as number) - flat).toBeCloseTo(2 * a, 9)
        if (Math.abs(a) > 0.1) moved++
      }
    expect(moved).toBeGreaterThan(3)
  }, 60_000)

  it('is never used while the score’s own test is held, though a reading’s own is open', () => {
    const r = knownAheadReader(recordOf(ALL()), T)
    expect(r.state().score).toBe(true)
    expect(r.opens().readings[0]).toBe(true)
    expect(r.state().readings).toEqual([false, false, false, false, false, false])
  }, 60_000)

  it('reads its own chance and shrinking: a looser chance takes in a weaker rhythm, nothing leaves the term out, and a shrinking far larger adds nothing', () => {
    const weak = recordOf(standIn({ steps: thinned(0.1, inTwoReadings), wobble: twoReadingsWobble }))
    expect(knownAheadReader(weak, T).state().inUse).toBe(false)
    expect(knownAheadReader(weak, T, { ...STAGE_C, readingChance: 0.01 }).state().readings[1]).toBe(true)
    const rec = recordOf(TWO())
    expect(knownAheadReader(rec, T, { ...STAGE_C, readingChance: 0 }).state().inUse).toBe(false)
    const shrunk = knownAheadReader(rec, T, { ...STAGE_C, readingShrink: 1e6 })
    expect(shrunk.state().readings[0]).toBe(true)
    for (const block of BLOCKS) expect(shrunk.forecast(addDays(T, 2), block)).toBeCloseTo(flatOf(rec, T, addDays(T, 2), block) as number, 9)
  }, 60_000)
})

describe('the weather’s term', () => {
  it('is in use where sunshine drives the day and forecasts have been kept: one measure, the sunshine', () => {
    const r = knownAheadReader(recordOf(SUN()), T)
    expect(r.state()).toEqual({ inUse: true, score: false, readings: [false, false, false, false, false, false], weather: [true, false, false] })
    expect(wayOfState(r.state())).toBe(LEVEL_WEATHER)
    expect(measureOfState(r.state())).toBe('sunshine')
  }, 60_000)

  it('lays its shift from the forecast issued on the day of writing, and from no other', async () => {
    const s = SUN()
    const later = addDays(T, 3)
    const said = (s.days.find((d) => d.day === T)?.weatherIssued?.days.find((f) => f.day === later)?.sun ?? 0) as number
    const change = (days: DayContext[], issuedOn: string, by: number): DayContext[] => days.map((d) => (d.day === issuedOn && d.weatherIssued ? { ...d, weatherIssued: { ...d.weatherIssued, days: d.weatherIssued.days.map((f) => (f.day === later ? { ...f, sun: f.sun + by } : f)) } } : d))
    const base = knownAheadReader(recordOf(s), T).forecast(later, 'morning') as number
    await pause()
    const up2 = knownAheadReader(recordOf({ ...s, days: change(s.days, T, 2) }), T).forecast(later, 'morning') as number
    await pause()
    const up4 = knownAheadReader(recordOf({ ...s, days: change(s.days, T, 4) }), T).forecast(later, 'morning') as number
    await pause()
    expect(said).toBeGreaterThan(0)
    expect(Math.abs(up2 - base)).toBeGreaterThan(0.5)
    expect(up4 - base).toBeCloseTo(2 * (up2 - base), 9)
    // What yesterday's forecast said of the same day moves nothing.
    expect(knownAheadReader(recordOf({ ...s, days: change(s.days, addDays(T, -1), 4) }), T).forecast(later, 'morning')).toBe(base)
  }, 60_000)

  it('is not in use on a day with no forecast issued, nor where its level stands on fewer than fourteen of the twenty-eight days before', async () => {
    const s = SUN()
    const noIssue = s.days.map((d) => (d.day === T ? { ...d, weatherIssued: undefined } : d))
    expect(knownAheadReader(recordOf({ ...s, days: noIssue }), T).state().inUse).toBe(false)
    await pause()
    const keep = (n: number): DayContext[] => s.days.map((d) => (d.day < T && d.day >= addDays(T, -28) && d.day < addDays(T, -n) ? { ...d, weather: undefined } : d))
    expect(knownAheadReader(recordOf({ ...s, days: keep(14) }), T).state().weather[0]).toBe(true)
    await pause()
    expect(knownAheadReader(recordOf({ ...s, days: keep(13) }), T).state().inUse).toBe(false)
  }, 60_000)

  it('trusts a distance only once it has its pairs: with forecasts kept for thirty days, only the nearest three move', () => {
    const s = SUN()
    const from = addDays(T, -30)
    const short = s.days.map((d) => (d.day < from ? { ...d, weatherIssued: undefined } : d))
    const rec = recordOf({ ...s, days: short })
    const r = knownAheadReader(rec, T, { ...STAGE_C })
    expect(r.state().weather[0]).toBe(true)
    for (let h = 3; h <= HORIZON; h++) expect(r.forecast(addDays(T, h), 'evening')).toBe(flatOf(rec, T, addDays(T, h), 'evening'))
    expect(Math.abs((r.forecast(addDays(T, 1), 'evening') as number) - (flatOf(rec, T, addDays(T, 1), 'evening') as number))).toBeGreaterThan(0.1)
  }, 60_000)

  it('trusts a distance by the slope, through nothing, of what came on what was said, each less the day of issue’s level: forecasts said twice as far out are trusted half as much, and lay the same shift', async () => {
    const rec = recordOf(SUN())
    const levels = new Map<string, number | null>()
    const level = (u: string): number | null => {
      if (!levels.has(u)) {
        const got = Array.from({ length: 28 }, (_, k) => rec.observed(0, addDays(u, -1 - k))).filter((v): v is number => v !== null)
        levels.set(u, got.length >= 14 ? got.reduce((a, b) => a + b, 0) / got.length : null)
      }
      return levels.get(u) as number | null
    }
    // Forecasts that said exactly what came, then the same said twice as far from the level; for the days still to come, the stand-in's own, alike.
    const said = (far: number): KnownAheadRecord => ({
      ...rec,
      issued: (m, u, h) => {
        const lv = level(u)
        const came = addDays(u, h) < T ? rec.observed(m, addDays(u, h)) : rec.issued(m, u, h)
        return m !== 0 || lv === null || came === null ? rec.issued(m, u, h) : lv + far * (came - lv)
      },
    })
    const one = knownAheadReader(said(1), T)
    expect(one.state().weather[0]).toBe(true)
    await pause()
    const two = knownAheadReader(said(2), T)
    expect(two.state().weather[0]).toBe(true)
    await pause()
    for (let h = 1; h <= HORIZON; h++) {
      const day = addDays(T, h)
      const flat = flatOf(rec, T, day, 'morning') as number
      expect(Math.abs((one.forecast(day, 'morning') as number) - flat)).toBeGreaterThan(0.01)
      expect(two.forecast(day, 'morning') as number).toBeCloseTo(one.forecast(day, 'morning') as number, 6)
    }
  }, 60_000)

  it('keeps each distance’s trust between nothing and one, through nothing, and nothing under its pairs', () => {
    expect(trustOf(10, 5, 30, 28)).toBe(0.5)
    expect(trustOf(10, 25, 30, 28)).toBe(1)
    expect(trustOf(10, -5, 30, 28)).toBe(0)
    expect(trustOf(10, 5, 27, 28)).toBe(0)
    expect(trustOf(0, 5, 30, 28)).toBe(0)
  })

  it('takes one measure at most, the one whose chance is smallest', async () => {
    const rec = recordOf(SUN())
    // The day's high made to follow the sunshine, less closely than the sunshine does: both are open, and the sunshine is taken.
    const next = (day: string) => (Number(day.slice(8, 10)) % 3) - 1
    const highLike = (m: number, v: number | null, day: string): number | null => (v === null ? null : m === 2 ? 12 + 0.6 * v + 0.8 * next(day) : v)
    const both: KnownAheadRecord = { ...rec, observed: (m, day) => highLike(m, rec.observed(m === 2 ? 0 : m, day), day), issued: (m, u, h) => highLike(m, rec.issued(m === 2 ? 0 : m, u, h), addDays(u, h)) }
    const r = knownAheadReader(both, T)
    expect(r.opens().weather[0] && r.opens().weather[2]).toBe(true)
    expect(r.state().weather).toEqual([true, false, false])
    await pause()
    // The two turned round: the noisier is now the sunshine, and the high is taken.
    const swapped: KnownAheadRecord = { ...both, observed: (m, day) => both.observed(m === 0 ? 2 : m === 2 ? 0 : m, day), issued: (m, u, h) => both.issued(m === 0 ? 2 : m === 2 ? 0 : m, u, h) }
    expect(knownAheadReader(swapped, T).state().weather).toEqual([false, false, true])
  }, 60_000)

  it('reads its own chance and shrinking: a looser chance takes in a weaker tie, nothing leaves the term out, and a shrinking far larger adds nothing', () => {
    const weak = recordOf(standIn({ steps: thinned(0.13, bySunshine()), weather: true }))
    expect(knownAheadReader(weak, T).state().inUse).toBe(false)
    expect(knownAheadReader(weak, T, { ...STAGE_C, weatherChance: 0.01 }).state().weather[0]).toBe(true)
    const rec = recordOf(SUN())
    expect(knownAheadReader(rec, T, { ...STAGE_C, weatherChance: 0 }).state().inUse).toBe(false)
    const shrunk = knownAheadReader(rec, T, { ...STAGE_C, weatherShrink: 1e9 })
    expect(shrunk.state().weather[0]).toBe(true)
    expect(shrunk.forecast(addDays(T, 1), 'morning')).toBeCloseTo(flatOf(rec, T, addDays(T, 1), 'morning') as number, 9)
  }, 60_000)
})

describe('the changed schedule', () => {
  it('leaves a past day of another kind out of the test: forty days after office days move, Stage C is not in use, as the level-plus-weekday way by its own test is', () => {
    const s = moved(40)
    const r = knownAheadReader(recordOf(s), T)
    expect(r.state().inUse).toBe(false)
    // The probe: with the rule off, the same record holds the test.
    expect(knownAheadReader(recordOf(s), T, { ...STAGE_C, reset: false }).state().score).toBe(true)
    // Sixty days after, the new days are enough again.
    expect(knownAheadReader(recordOf(moved(60)), T).state().score).toBe(true)
  }, 60_000)

  it('asks for at least five weekdays', () => {
    const s = moved(40)
    expect(knownAheadReader(recordOf(s), T, { ...STAGE_C, minWeekdays: 3 }).state().score).toBe(true)
    expect(knownAheadReader(recordOf(s), T, { ...STAGE_C, minWeekdays: 5 }).state().score).toBe(false)
  }, 60_000)
})

describe('the hold', () => {
  it('is open today and on each of the twenty-eight days before: twenty-nine days running, one closed day breaking it', () => {
    const openFrom = (first: string, closed: string[] = []) => (day: string) => day >= first && !closed.includes(day)
    expect(heldOpen(openFrom(addDays(T, -28)), T, 29)).toBe(true)
    expect(heldOpen(openFrom(addDays(T, -27)), T, 29)).toBe(false)
    expect(heldOpen(openFrom(addDays(T, -60), [addDays(T, -14)]), T, 29)).toBe(false)
    expect(heldOpen(openFrom(addDays(T, -60), [T]), T, 29)).toBe(false)
    expect(heldOpen(openFrom(addDays(T, -60), [addDays(T, -29)]), T, 29)).toBe(true)
  })

  it('in the reader: a test open from a day is in use from twenty-eight days after it, not before', async () => {
    const rec = recordOf(moved(100))
    const days = Array.from({ length: 100 }, (_, k) => addDays(T, k - 99))
    const opened: boolean[] = []
    // One reader a day of writing, the runner given its turn between them.
    for (const d of days) {
      opened.push(knownAheadReader(rec, d).opens().score)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const first = opened.indexOf(true)
    expect(first).toBeGreaterThan(0)
    // The precondition: once open, it stays open to the end.
    expect(opened.slice(first).every(Boolean)).toBe(true)
    expect(first + 28).toBeLessThan(days.length)
    expect(knownAheadReader(rec, days[first + 27]).state().score).toBe(false)
    expect(knownAheadReader(rec, days[first + 28]).state().score).toBe(true)
  }, 120_000)
})

describe('what Stage C reads, and what it never reads', () => {
  /** A record that refuses every read of a day of writing or after, but the forecast issued that day. */
  function strict(rec: KnownAheadRecord, today: string): KnownAheadRecord {
    const late = (what: string): never => {
      throw new Error(`Stage C read ${what}`)
    }
    const guard = (m: ReadonlyMap<string, number>): ReadonlyMap<string, number> => ({ get: (k: string) => (k.slice(0, 10) >= today ? late(`the slot ${k}`) : m.get(k)), keys: () => m.keys() }) as unknown as ReadonlyMap<string, number>
    return {
      values: guard(rec.values),
      readings: rec.readings.map(guard),
      share: rec.share,
      sameKind: (day, asOf) => (day >= today ? late(`the kind of ${day}`) : asOf > today ? late(`the template of ${asOf}`) : rec.sameKind(day, asOf)),
      observed: (m, day) => (day >= today ? late(`the weather of ${day}`) : rec.observed(m, day)),
      issued: (m, u, h) => (u > today ? late(`a forecast issued on ${u}`) : rec.issued(m, u, h)),
    }
  }
  const look = (rec: KnownAheadRecord, today: string) => {
    const r = knownAheadReader(rec, today)
    const forecasts = Array.from({ length: 38 }, (_, k) => addDays(today, k - 30)).flatMap((d) => BLOCKS.map((b) => r.forecast(d, b)))
    return JSON.stringify([r.state(), [...(r.rows() ?? [])], forecasts])
  }

  for (const [name, make] of [['the readings’ term', () => standIn({ steps: inTwoReadings, wobble: twoReadingsWobble, today: addDays(T, 10), days: 210 })], ['the weather’s term', () => standIn({ steps: bySunshine(), weather: true, today: addDays(T, 10), days: 210 })]] as const) {
    it(`reads nothing logged on or after the day of writing, nor that day’s own weather, nor a forecast issued after it (${name})`, async () => {
      const full = make()
      const all = recordOf(full)
      // The same record as the phone held it at the start of the day: nothing of the day or after, but the forecast issued that day.
      const cut: StandIn = { ...full, checkins: full.checkins.filter((c: CheckIn) => c.day < T), days: full.days.filter((d) => d.day <= T).map((d) => (d.day === T ? { ...d, weather: undefined } : d)) }
      const before = recordOf(cut)
      const pause = () => new Promise((resolve) => setTimeout(resolve, 0))
      expect(knownAheadReader(before, T).state().inUse).toBe(true)
      const seen = look(before, T)
      await pause()
      expect(look(all, T)).toBe(seen)
      await pause()
      expect(look(strict(all, T), T)).toBe(seen)
    }, 120_000)
  }
})

describe('the ranges', () => {
  it('take each past miss less what was open on the record of its own day, never today’s', () => {
    const rec = recordOf(SUN())
    const r = knownAheadReader(rec, T)
    const rows = r.rows() as Map<string, { point: number; lo: number; hi: number }>
    const values = rec.values as Map<string, number>
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
    const missesAt = (ahead: number): number[] => {
      const out: number[] = []
      for (let back = 1; back <= 28; back++) {
        const x = addDays(T, -back)
        for (const b of BLOCKS) {
          const actual = values.get(slotKey(x, b))
          const p = actual === undefined ? null : predict('sameBlock', ahead <= 1 ? values : visibleBefore(values, addDays(x, -ahead)), x, b)
          if (actual !== undefined && p !== null) out.push(actual - p - r.shiftOn(addDays(x, -(Math.max(1, ahead) - 1)), x, b))
        }
      }
      return out
    }
    let checked = 0
    for (let h = 0; h <= HORIZON; h++) {
      const near = missesAt(1)
      const far = h > 1 ? missesAt(h) : []
      const band = far.length >= 5 ? errorBand(far) : errorBand(near)
      for (const b of BLOCKS) {
        const day = addDays(T, h)
        const p = r.forecast(day, b) as number
        expect(rows.get(`${day}|${b}|${h}`)).toEqual({ point: clamp(p), lo: clamp(p + band.lo), hi: clamp(p + band.hi) })
        checked++
      }
    }
    expect(checked).toBe(24)
    // The probe: what today's record would have taken off differs from each day's own.
    expect(Array.from({ length: 28 }, (_, k) => addDays(T, -1 - k)).some((x) => Math.abs(r.shiftOn(x, x, 'morning') - r.shiftOn(T, x, 'morning')) > 0.01)).toBe(true)
  }, 60_000)
})

describe('Stage C’s forecast for the challenger’s base', () => {
  it('is a past day’s by that day’s own state, and a day’s from today on by today’s; the same-block way’s where Stage C was not in use', () => {
    const rec = recordOf(moved(100))
    const r = knownAheadReader(rec, T)
    expect(r.state().inUse).toBe(true)
    // Long ago, when Stage C was not yet in use: the same-block way's, number for number.
    const early = addDays(T, -60)
    expect(knownAheadReader(rec, early).state().inUse).toBe(false)
    for (const b of BLOCKS) expect(r.forecast(early, b)).toBe(flatOf(rec, T, early, b))
    // Today and after: today's shift.
    const later = addDays(T, 2)
    for (const b of BLOCKS) expect(r.forecast(later, b)).toBe((flatOf(rec, T, later, b) as number) + r.shiftOn(T, later, b))
  }, 60_000)
})

describe('a day’s scheduled kind, and the record the reader is given', () => {
  const settings = (over: Partial<Settings['week']> = {}): Settings => ({ ...DEFAULT_SETTINGS, week: { ...DEFAULT_SETTINGS.week, officeDays: { ...DEFAULT_SETTINGS.week.officeDays, 2: true }, studyNights: { ...DEFAULT_SETTINGS.week.studyNights, 3: true }, pickupTime: '17:00', ...over } })
  // 2026-11-24 is a Tuesday.
  const TUE = '2026-11-24'

  it('takes the four parts a day was scheduled with from its own row, and never what was marked by hand', () => {
    const ctx = contextFromWeek(TUE, settings(), `${TUE}T06:00:00.000Z`, 'gated')
    expect(kindOfDay(ctx)).toEqual({ office: true, churchDay: false, church: 'third', study: false, daycare: true })
    expect(kindOfDay({ ...ctx, atOffice: false, changed: true })).toEqual(kindOfDay(ctx))
    expect(kindOfWeekday(settings().week, 2 as Weekday)).toEqual({ office: true, churchDay: false, church: 'third', study: false, daycare: true })
    expect(kindOfWeekday(settings({ pickupTime: null }).week, 2 as Weekday).daycare).toBe(false)
  })

  it('leaves out a part an older row does not hold, and reads a trip’s day by what the trip kept aside', () => {
    const ctx = contextFromWeek(TUE, settings(), `${TUE}T06:00:00.000Z`, 'gated')
    const { officeDay: _o, schedule: _s, church: _c, services: _v, ...older } = ctx
    expect(kindOfDay(older as DayContext)).toEqual({ churchDay: false, study: false, daycare: true })
    const away = awayShaped(ctx)
    expect(away.pickupTime).toBeNull()
    expect(kindOfDay(away)).toEqual(kindOfDay(ctx))
    // Part by part: a part the row lacks matches whatever the template now says; a part it holds must be the same.
    const now = kindOfWeekday(settings().week, 2 as Weekday)
    expect(sameKindAs({ churchDay: false }, { ...now, office: false })).toBe(true)
    expect(sameKindAs(kindOfDay(ctx), { ...now, office: false })).toBe(false)
    expect(sameKindAs(kindOfDay(ctx), now)).toBe(true)
  })

  it('gives each reading’s points at every check-in with a score, and its share as the block asks it', () => {
    const s = NONE()
    const rec = recordOf(s)
    const c = s.checkins[10]
    expect(rec.readings).toHaveLength(6)
    expect(rec.readings[0].get(slotKey(c.day, c.block))).toBe(((c.answers.mood as number) - 1) * 25)
    expect(rec.readings[3].get(slotKey(c.day, c.block))).toBe(100 - ((c.answers.stress as number) - 1) * 25)
    for (const b of BLOCKS) for (let r = 0; r < 6; r++) expect(rec.share(r, b)).toBe(1 / 6)
    // At the short depth a block asks mood, energy and stress alone; with learned weights each weighs as the score weighs it.
    const short = recordOf(s, { depth: 'short' })
    expect([0, 1, 2, 3, 4, 5].map((r) => short.share(r, 'evening'))).toEqual([1 / 3, 1 / 3, 0, 1 / 3, 0, 0])
    const weighed = recordOf(s, { weights: { mood: 2 } })
    expect(weighed.share(0, 'morning')).toBe(2 / 7)
    expect(weighed.share(1, 'morning')).toBe(1 / 7)
  })

  it('gives the weather as it came and the forecasts as issued, from the record of the day of issue', () => {
    const s = SUN()
    const rec = recordOf(s)
    const day = addDays(T, -5)
    const ctx = s.days.find((d) => d.day === day) as DayContext
    expect([0, 1, 2].map((m) => rec.observed(m, day))).toEqual([ctx.weather?.sun, ctx.weather?.rain, ctx.weather?.high])
    expect(rec.issued(0, day, 3)).toBe(ctx.weatherIssued?.days[3].sun)
    expect(rec.issued(0, day, 3)).not.toBe(rec.issued(0, addDays(day, 1), 2))
    expect(rec.observed(0, addDays(T, -400))).toBeNull()
    expect(rec.issued(0, addDays(T, -400), 1)).toBeNull()
    // A day with no record of its own is set beside the template as no kind: nothing of it is left out.
    expect(rec.sameKind(addDays(T, -400), T)).toBe(true)
  }, 60_000)
})

describe('the way a day’s rows name', () => {
  it('names the terms in use that day', () => {
    const st = (score: boolean, reading: boolean, weather: boolean): KnownAheadState => ({ inUse: score || reading || weather, score, readings: [reading, false, false, false, false, false], weather: [weather, false, false] })
    expect(wayOfState(st(false, false, false))).toBeNull()
    expect(wayOfState(st(true, false, false))).toBe(LEVEL_WEEKDAY)
    expect(wayOfState(st(false, true, false))).toBe(LEVEL_READINGS)
    expect(wayOfState(st(false, false, true))).toBe(LEVEL_WEATHER)
    expect(wayOfState(st(true, false, true))).toBe(LEVEL_WEEKDAY_WEATHER)
    expect(wayOfState(st(false, true, true))).toBe(LEVEL_WEEKDAY_WEATHER)
    expect(measureOfState({ ...st(false, false, false), weather: [false, false, true] })).toBe('high')
    expect(measureOfState(st(true, false, false))).toBeNull()
  })
})

describe('the rows the writer adds on a day Stage C is in use', () => {
  const f = (day: string, block: Block, horizon: number, more: Partial<Forecast> = {}): Forecast => ({ day, block, horizon, madeOn: T, model: 'blend', point: 50, lo: 40, hi: 60, whatIf: 48, ...more })
  const ahead = (rows: [string, number][], over: Partial<KnownAheadDay> = {}): KnownAheadDay => ({ way: LEVEL_WEATHER, rows: new Map(rows.map(([k, p]) => [k, { point: p, lo: p - 8, hi: p + 7 }])), stageB: null, weather: 'sunshine', ...over })
  const none = () => false

  it('takes Stage C’s numbers and the day’s way over the pick’s rows, keeping the what-if, the key order, the four’s row, the Stage B way’s and the measure', () => {
    const due = [f(T, 'morning', 0), f(addDays(T, 1), 'evening', 1)]
    const out = rowsWithKnownAhead(due, ahead([[`${T}|morning|0`, 61], [`${addDays(T, 1)}|evening|1`, 44]], { stageB: new Map([[`${T}|morning|0`, { point: 57, lo: 49, hi: 64 }]]) }), [], new Map(), T, () => null, none)
    expect(out[0]).toEqual({ day: T, block: 'morning', horizon: 0, madeOn: T, model: LEVEL_WEATHER, point: 61, lo: 53, hi: 68, whatIf: 48, four: { model: 'blend', point: 50, lo: 40, hi: 60 }, stageB: { point: 57, lo: 49, hi: 64 }, weather: 'sunshine' })
    expect(Object.keys(out[0])).toEqual([...Object.keys(due[0]), 'four', 'stageB', 'weather'])
    expect(out[1].stageB).toBeUndefined()
    expect(out[1].weather).toBe('sunshine')
    const noWeather = rowsWithKnownAhead(due, ahead([[`${T}|morning|0`, 61]], { way: LEVEL_READINGS, weather: null }), [], new Map(), T, () => null, none)
    expect(noWeather[0].model).toBe(LEVEL_READINGS)
    expect('weather' in noWeather[0]).toBe(false)
  })

  it('keeps a slot of the pick’s alone as the pick wrote it, and writes a slot of Stage C’s alone only under the pick’s skips', () => {
    const due = [f(T, 'morning', 0)]
    const mine = ahead([[`${T}|afternoon|0`, 55], [`${T}|evening|0`, 52], [`${addDays(T, 1)}|morning|1`, 50]])
    const out = rowsWithKnownAhead(due, mine, [f(addDays(T, 1), 'morning', 1)], new Map([[slotKey(T, 'evening'), 70]]), T, () => 47, none)
    expect(out).toEqual([due[0], { day: T, block: 'afternoon', horizon: 0, madeOn: T, model: LEVEL_WEATHER, point: 55, lo: 47, hi: 62, whatIf: 47, weather: 'sunshine' }])
  })

  it('writes no row for a day inside a planned trip, neither Stage C’s nor the pick’s', () => {
    const due = [f(T, 'morning', 0), f(addDays(T, 2), 'morning', 2), f(addDays(T, 3), 'morning', 3)]
    const rows = ahead([[`${T}|morning|0`, 61], [`${addDays(T, 2)}|morning|2`, 50], [`${addDays(T, 3)}|morning|3`, 52]])
    const trip = (day: string) => day === addDays(T, 2)
    const out = rowsWithKnownAhead(due, rows, [], new Map(), T, () => null, trip)
    expect(out.map((r) => r.day)).toEqual([T, addDays(T, 3)])
    // The probe: with no trip, the day is written.
    expect(rowsWithKnownAhead(due, rows, [], new Map(), T, () => null, none).map((r) => r.day)).toEqual([T, addDays(T, 2), addDays(T, 3)])
  })
})

describe('the document of Stage C (docs/week-ahead-known.md)', () => {
  const doc = readFileSync(new URL('../docs/week-ahead-known.md', import.meta.url), 'utf8')

  it('states the code’s numbers, the two verdicts’ fingerprints and the switch', () => {
    expect(doc).toContain('| The readings’ test’s chance | at most 1 in 200,000 |')
    expect(STAGE_C.readingChance).toBe(1 / 200_000)
    expect(doc).toContain(`| The readings’ shrinking | ${STAGE_C.readingShrink} |`)
    expect(doc).toContain(`| Least weekdays a test runs on | ${STAGE_C.minWeekdays} |`)
    expect(doc).toContain('| The weather’s test’s chance | at most 1 in 10,000 |')
    expect(STAGE_C.weatherChance).toBe(1 / 10_000)
    expect(doc).toContain(`| The weather’s shrinking | ${STAGE_C.weatherShrink} |`)
    expect(doc).toContain(`| The weather’s window | ${STAGE_C.weatherWindow} days |`)
    expect(doc).toContain(`| The weather’s level | the ${STAGE_C.weatherLevel} days before, at least ${STAGE_C.weatherLevel / 2} of them |`)
    expect(doc).toContain(`| Least pairs before a distance is trusted | ${STAGE_C.minPairs} |`)
    expect(doc).toContain(`| The hold | ${WEEK.hold} days |`)
    expect(STAGE_C.reset).toBe(true)
    expect(STAGE_C.eventChance).toBe(0)
    expect(doc).toContain('058115f722638bf16000e2e6e28321a88d87aa4608db3c299194967b42b4a899')
    expect(doc).toContain('31bbae40ebeeb57a58b3a784c23998e449e107e4378cd7475f77c49ae790b090')
    expect(doc).toContain(`\`KNOWN_AHEAD_ON = ${KNOWN_AHEAD_ON}\``)
  })

  it('gives each way’s words exactly as the app says them', () => {
    for (const way of [LEVEL_READINGS, LEVEL_WEATHER, LEVEL_WEEKDAY_WEATHER] as const) expect(doc).toContain('`' + copy.brief.models[way] + '`')
    expect(doc).toContain('`' + copy.weekly.modelWeather + '`')
    expect(doc).toContain('`' + copy.weekly.modelWeekdayWeather + '`')
    expect(doc).toContain('`' + copy.weekly.modelWeekdays + '`')
  })
})
