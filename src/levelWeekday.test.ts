import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, BLOCKS, type Block } from './blocks'
import { CHALLENGER, fourWays, runChallenger, type ChallengerRun, type Predict } from './challenger'
import { adjustRows, sleepCondition } from './challengerRecord'
import { fixtureCheckin } from './challengerTesting'
import { seeded } from './counted/compare'
import { weekdayOf } from './counted/occasions'
import { copy } from './copy'
import type { CheckIn, Forecast } from './db'
import { errorBand, LEVEL_WEEKDAY, MODELS, predict, valuesByKey, visibleBefore } from './forecast'
import { fChance, gateOf, LEVEL_WEEKDAY_ON, levelWeekdayOn, levelWeekdayReader, levelWeekdayRows, rowsWithTheWay, setLevelWeekdayForTests, WEEK, type DayMiss, type Gate, type WeekNumbers } from './levelWeekday'
import { RHYTHM_TODAY, rhythmCheckins } from './levelWeekdayTesting'
import { slotKey } from './observe'
import type { Position } from './readings'

// The week ahead's level-plus-weekday way, moved into the app number for number (Stage A, 2026-11-21): its test of the
// seven weekdays together, its shifts and their strength, the days it reads, its hold, its rows and their ranges, and
// what the writer adds on a day it is in use. Hand-worked days and stand-in records only; the way's switch is off.

afterEach(() => setLevelWeekdayForTests(null))

describe('the way’s numbers and its switch', () => {
  it('keeps the numbers both verdicts were read on', () => {
    expect(WEEK).toEqual({ window: 180, chance: 0.000001, minDays: 4, hold: 28, shrink: 2 })
    expect(LEVEL_WEEKDAY).toBe('levelWeekday')
  })

  it('is switched off in the code, and a test can set it either way and back', () => {
    expect(LEVEL_WEEKDAY_ON).toBe(false)
    expect(levelWeekdayOn()).toBe(false)
    setLevelWeekdayForTests(true)
    expect(levelWeekdayOn()).toBe(true)
    setLevelWeekdayForTests(null)
    expect(levelWeekdayOn()).toBe(false)
  })
})

describe('the chance of a spread this large among the weekdays with nothing there (fChance)', () => {
  it('gives the F distribution’s chances at known values', () => {
    expect(fChance(3.186, 6, 50)).toBeCloseTo(0.01, 4)
    expect(fChance(2.254, 6, 60)).toBeCloseTo(0.05, 4)
    expect(fChance(4.372, 6, 60)).toBeCloseTo(0.001, 5)
    expect(fChance(0, 6, 60)).toBe(1)
  })
})

// Hand-worked days: four of each weekday, each weekday's miss its effect at a scale, plus a small fixed wobble.
const EFFECT = [3, -9, -4, 0, 0, 4, 7]
const WOBBLE = [-1, 0.5, 1, -0.5]
function handDays(scale: number, short: number | null = null): DayMiss[] {
  const out: DayMiss[] = []
  for (let j = 0; j < 4; j++) for (let w = 0; w < 7; w++) if (!(short === w && j === 3)) out.push({ weekday: w, miss: scale * EFFECT[w] + WOBBLE[(w + j) % 4] })
  return out
}
/** The design's items 4, 5 and 7 worked by hand: each weekday's average less the average over all the days, F, and the strength. */
function byHand(days: readonly DayMiss[]): { f: number; offset: number[] } {
  const n = [0, 0, 0, 0, 0, 0, 0]
  const sum = [0, 0, 0, 0, 0, 0, 0]
  for (const d of days) {
    n[d.weekday] += 1
    sum[d.weekday] += d.miss
  }
  const mean = sum.map((s, w) => s / n[w])
  const all = sum.reduce((a, b) => a + b, 0) / days.length
  let between = 0
  for (let w = 0; w < 7; w++) between += n[w] * (mean[w] - all) ** 2
  let inside = 0
  for (const d of days) inside += (d.miss - mean[d.weekday]) ** 2
  return { f: between / 6 / (inside / (days.length - 7)), offset: mean.map((m) => m - all) }
}
const nothing = (g: Gate): boolean => g.shift.every((s) => s === 0)

describe('the test of the seven weekdays together, its shifts and their strength (gateOf), on hand-worked days', () => {
  it('is closed while a weekday has fewer than four days, and open once each has four', () => {
    const short = gateOf(handDays(1, 3))
    expect(short).toMatchObject({ open: false, f: null, chance: null })
    expect(nothing(short)).toBe(true)
    // The probe: the same days with the fourth Wednesday back.
    expect(gateOf(handDays(1)).open).toBe(true)
  })

  it('is closed where the chance of the spread is above 1 in 1,000,000, and open where it is at or under it', () => {
    const near = gateOf(handDays(0.3))
    expect(near.f).toBeCloseTo(12.3017, 3)
    expect(near.chance as number).toBeGreaterThan(0.000001)
    expect(near.chance as number).toBeLessThan(0.00001)
    expect(near.open).toBe(false)
    expect(nothing(near)).toBe(true)
    expect(gateOf(handDays(0.3), { ...WEEK, chance: 0.00001 }).open).toBe(true)
    const clear = gateOf(handDays(0.5))
    expect(clear.chance as number).toBeLessThan(0.000001)
    expect(clear.open).toBe(true)
  })

  it('shifts each weekday by its average less the average over all the days, times 1 − 2/F', () => {
    for (const scale of [1, 0.5]) {
      const days = handDays(scale)
      const g = gateOf(days)
      const hand = byHand(days)
      expect(g.f as number).toBeCloseTo(hand.f, 9)
      g.shift.forEach((s, w) => expect(s).toBeCloseTo(hand.offset[w] * (1 - 2 / hand.f), 9))
    }
    // The numbers themselves, at full scale: F 136.686, Monday −9.009, Saturday +6.757.
    const g = gateOf(handDays(1))
    expect(g.f as number).toBeCloseTo(136.686, 3)
    expect(g.shift[1]).toBeCloseTo(-9.009, 3)
    expect(g.shift[6]).toBeCloseTo(6.757, 3)
  })

  it('never takes a strength under nothing: where F is under the shrinking, every shift is nothing', () => {
    const open: WeekNumbers = { ...WEEK, chance: 1 }
    const weak = gateOf(handDays(0.03), open)
    expect(weak.open).toBe(true)
    expect(weak.f as number).toBeLessThan(2)
    expect(nothing(weak)).toBe(true)
    // The probe: with no shrinking the same days do shift.
    expect(nothing(gateOf(handDays(0.03), { ...open, shrink: 0 }))).toBe(false)
  })
})

/** The gate for a day worked out by hand from the record: each day of the window before it once, at the average of its check-ins' misses of the same-block way. */
function gateByHand(values: ReadonlyMap<string, number>, today: string, numbers: WeekNumbers): Gate {
  const days: DayMiss[] = []
  for (let back = numbers.window; back >= 1; back--) {
    const day = addDays(today, -back)
    const misses = BLOCKS.flatMap((b) => {
      const v = values.get(slotKey(day, b))
      const p = predict('sameBlock', values, day, b)
      return v === undefined || p === null ? [] : [v - p]
    })
    if (misses.length) days.push({ weekday: weekdayOf(day), miss: misses.reduce((a, b) => a + b, 0) / misses.length })
  }
  return gateOf(days, numbers)
}

describe('the way on a record with a strong weekly rhythm (levelWeekdayReader)', () => {
  const values = valuesByKey(rhythmCheckins())
  const reader = levelWeekdayReader(values)
  const START = addDays(RHYTHM_TODAY, -200)
  /** The first day the gate is open. */
  const firstOpen = (): string => {
    for (let d = START; d <= RHYTHM_TODAY; d = addDays(d, 1)) if (reader.gate(d).open) return d
    throw new Error('the gate never opened')
  }

  it('reads each day of the window once, at the average of its check-ins’ misses, and no day outside it', () => {
    for (const day of [RHYTHM_TODAY, '2026-09-01', '2026-07-05']) {
      const g = reader.gate(day)
      const hand = gateByHand(values, day, WEEK)
      expect(g.open).toBe(true)
      expect(g.f as number).toBeCloseTo(hand.f as number, 9)
      g.shift.forEach((s, w) => expect(s).toBeCloseTo(hand.shift[w], 9))
    }
    // The probe: a shorter window reads fewer days, and another F.
    const short = levelWeekdayReader(values, { ...WEEK, window: 60 }).gate(RHYTHM_TODAY)
    expect(short.f as number).toBeCloseTo(gateByHand(values, RHYTHM_TODAY, { ...WEEK, window: 60 }).f as number, 9)
    expect(Math.abs((short.f as number) - (reader.gate(RHYTHM_TODAY).f as number))).toBeGreaterThan(1)
  })

  it('is in use only once its test has stood open on the day and on each of the 28 days before', () => {
    const d0 = firstOpen()
    expect(d0).toBe('2026-06-07')
    for (let d = d0; d <= RHYTHM_TODAY; d = addDays(d, 1)) expect(reader.gate(d).open, d).toBe(true)
    // Open on the day and on 27 days before, closed on the 28th: not in use.
    expect(reader.state(addDays(d0, 27))).toMatchObject({ open: true, held: false, inUse: false })
    expect(reader.rows(addDays(d0, 27))).toBeNull()
    // Open 29 days running: in use.
    expect(reader.state(addDays(d0, 28))).toMatchObject({ open: true, held: true, inUse: true })
    expect(reader.state(addDays(d0, -1))).toMatchObject({ open: false, held: false, inUse: false })
    expect(reader.state(RHYTHM_TODAY).inUse).toBe(true)
  })

  it('works each day out from the record before it: nothing logged on or after a day changes that day’s state', () => {
    const day = '2026-08-01'
    const turned = new Map(values)
    for (const [k, v] of values) if (k.slice(0, 10) >= day) turned.set(k, 100 - v)
    const other = levelWeekdayReader(turned)
    expect(JSON.stringify(other.state(day))).toBe(JSON.stringify(reader.state(day)))
    // The probe: the turned days do reach a later day's state.
    expect(JSON.stringify(other.state(RHYTHM_TODAY))).not.toBe(JSON.stringify(reader.state(RHYTHM_TODAY)))
  })

  it('writes today’s own rows from the record before today: nothing logged on or after today changes them', () => {
    const own = (r: ReturnType<typeof levelWeekdayReader>) => JSON.stringify([...(r.rows(RHYTHM_TODAY) ?? new Map())].filter(([k]) => k.endsWith('|0')))
    const later = new Map(values)
    for (let h = 0; h <= 7; h++) for (const b of BLOCKS) later.set(slotKey(addDays(RHYTHM_TODAY, h), b), h % 2 ? 0 : 100)
    expect(own(reader)).toContain(`${RHYTHM_TODAY}|morning|0`)
    expect(own(levelWeekdayReader(later))).toBe(own(reader))
    // The probe: yesterday's evening does move today's evening.
    const yesterday = new Map(values)
    yesterday.set(slotKey(addDays(RHYTHM_TODAY, -1), 'evening'), 0)
    expect(own(levelWeekdayReader(yesterday))).not.toBe(own(reader))
  })

  it('forecasts as the same-block way, number for number, where it was not in use, and with the day’s shift where it was', () => {
    const d0 = firstOpen()
    const notYet = addDays(d0, 10)
    expect(reader.state(notYet).inUse).toBe(false)
    for (const b of BLOCKS) expect(reader.forecast(RHYTHM_TODAY, notYet, b)).toBe(predict('sameBlock', values, notYet, b))
    const inUse = '2026-09-10'
    const s = reader.state(inUse)
    expect(s.inUse).toBe(true)
    BLOCKS.forEach((b, i) => expect(reader.forecast(RHYTHM_TODAY, inUse, b)).toBeCloseTo((predict('sameBlock', values, inUse, b) as number) + s.shift[weekdayOf(inUse)][i], 9))
    expect(levelWeekdayRows(values, RHYTHM_TODAY)).toEqual(reader.rows(RHYTHM_TODAY))
  })
})

// Two small records, morning check-ins alone, read with the test always open, no hold and no shrinking, so the range's
// rule can be worked by hand: fourteen mornings in a row (five misses seven days out), and thirteen after a day with an
// afternoon alone (four).
const OPEN_NOW: WeekNumbers = { window: 180, chance: 1, minDays: 1, hold: 0, shrink: 0 }
const START = '2026-03-02'
function mornings(afternoonFirst: boolean): { values: Map<string, number>; today: string } {
  const next = seeded(5)
  const rows: CheckIn[] = afternoonFirst ? [fixtureCheckin(START, 'afternoon', 3)] : []
  const first = afternoonFirst ? 1 : 0
  for (let i = first; i < 14; i++) rows.push(fixtureCheckin(addDays(START, i), 'morning', (1 + Math.floor(next() * 5)) as Position, 4))
  return { values: valuesByKey(rows), today: addDays(START, 14) }
}

describe('the way’s rows and their ranges, as its design says them', () => {
  for (const [label, afternoonFirst, far] of [['fourteen mornings', false, 5], ['thirteen mornings', true, 4]] as const) {
    it(`on ${label}: the same-block way’s forecast plus today’s shift, in the band of its own misses at that distance, each with the shift of its own day’s gate; with fewer than five, the band a day out`, () => {
      const { values, today } = mornings(afternoonFirst)
      const reader = levelWeekdayReader(values, OPEN_NOW)
      const misses = (ahead: number): number[] => {
        const out: number[] = []
        for (let back = 1; back <= 28; back++) {
          const x = addDays(today, -back)
          const shift = reader.gate(addDays(x, -(Math.max(1, ahead) - 1))).shift[weekdayOf(x)]
          for (const b of BLOCKS) {
            const actual = values.get(slotKey(x, b))
            const p = actual === undefined ? null : predict('sameBlock', ahead <= 1 ? values : visibleBefore(values, addDays(x, -ahead)), x, b)
            if (actual !== undefined && p !== null) out.push(actual - p - shift)
          }
        }
        return out
      }
      expect(misses(7)).toHaveLength(far)
      expect(misses(6).length).toBeGreaterThanOrEqual(5)
      expect(misses(1).length).toBeGreaterThan(5)
      const shift = reader.gate(today).shift
      expect(shift.some((s) => s !== 0)).toBe(true)
      const rows = reader.rows(today)
      expect(rows).not.toBeNull()
      expect((rows as Map<string, unknown>).size).toBe(8)
      const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
      for (let h = 0; h <= 7; h++) {
        const day = addDays(today, h)
        const p = (predict('sameBlock', values, day, 'morning') as number) + shift[weekdayOf(day)]
        const ahead = Math.max(1, h)
        const band = ahead > 1 && misses(ahead).length >= 5 ? errorBand(misses(ahead)) : errorBand(misses(1))
        expect(rows?.get(`${day}|morning|${h}`), `${h} days out`).toEqual({ point: clamp(p), lo: clamp(p + band.lo), hi: clamp(p + band.hi) })
      }
    })
  }
})

describe('the rows the writer adds on a day the way is in use (rowsWithTheWay)', () => {
  const T = RHYTHM_TODAY
  const pickRow = (h: number, block: Block, point: number): Forecast => ({ day: addDays(T, h), block, horizon: h, madeOn: T, model: 'weekdayBlock', point, lo: point - 8, hi: point + 7, whatIf: 55 })

  it('takes the way’s numbers and name for each of the pick’s rows it has, keeps the four’s beside them, and keeps the pick’s skips', () => {
    const due = [pickRow(0, 'morning', 50), pickRow(0, 'afternoon', 52), pickRow(1, 'morning', 54)]
    const before = JSON.stringify(due)
    const way = new Map([
      [`${T}|morning|0`, { point: 47, lo: 40, hi: 55 }],
      [`${addDays(T, 1)}|afternoon|1`, { point: 61, lo: 53, hi: 69 }],
      [`${addDays(T, 2)}|morning|2`, { point: 58, lo: 50, hi: 66 }],
      [`${T}|evening|0`, { point: 44, lo: 37, hi: 52 }],
    ])
    // Already there: a row at that distance for the morning two days out, and today's evening logged.
    const existing = [{ ...pickRow(2, 'morning', 57), madeOn: addDays(T, -1) }]
    const logged = new Map([[slotKey(T, 'evening'), 48]])
    const out = rowsWithTheWay(due, way, existing, logged, T, (day, block) => (day === addDays(T, 1) && block === 'afternoon' ? 59 : null))
    expect(out.map((f) => `${f.day}|${f.block}|${f.horizon}`)).toEqual([`${T}|morning|0`, `${T}|afternoon|0`, `${addDays(T, 1)}|morning|1`, `${addDays(T, 1)}|afternoon|1`])
    // The pick's row the way has: the way's point, low, high and name, its own what-if and key order, and the four's row kept.
    expect(out[0]).toEqual({ day: T, block: 'morning', horizon: 0, madeOn: T, model: 'levelWeekday', point: 47, lo: 40, hi: 55, whatIf: 55, four: { model: 'weekdayBlock', point: 50, lo: 42, hi: 57 } })
    expect(Object.keys(out[0])).toEqual(['day', 'block', 'horizon', 'madeOn', 'model', 'point', 'lo', 'hi', 'whatIf', 'four'])
    // The pick's rows the way does not have stay the pick's.
    expect(out[1]).toBe(due[1])
    expect(out[2]).toBe(due[2])
    // A slot the way alone has, under the same skips: the way's own row, with its what-if and no `four`.
    expect(out[3]).toEqual({ day: addDays(T, 1), block: 'afternoon', horizon: 1, madeOn: T, model: 'levelWeekday', point: 61, lo: 53, hi: 69, whatIf: 59 })
    expect('four' in out[3]).toBe(false)
    // Nothing given is changed.
    expect(JSON.stringify(due)).toBe(before)
  })
})

describe('the challenger with the way as its base', () => {
  const checkins = rhythmCheckins(true)
  const values = valuesByKey(checkins)

  it('answers the four by their own forecast, and the way by nothing, where no reader is given (fourWays)', () => {
    for (const m of MODELS) for (const b of BLOCKS) expect(fourWays(m, values, RHYTHM_TODAY, b)).toBe(predict(m, values, RHYTHM_TODAY, b))
    expect(fourWays(LEVEL_WEEKDAY, values, RHYTHM_TODAY, 'morning')).toBeNull()
    // The probe: the way's own reader has a forecast for the slot.
    expect(levelWeekdayReader(values).forecast(RHYTHM_TODAY, RHYTHM_TODAY, 'morning')).not.toBeNull()
  })

  it('tries the way through the forecast it is given, exactly as it tries one of the four', () => {
    const conditions = [sleepCondition(checkins)]
    const asWay = runChallenger(LEVEL_WEEKDAY, values, RHYTHM_TODAY, conditions, CHALLENGER, (m, v, d, b) => (m === LEVEL_WEEKDAY ? predict('sameBlock', v, d, b) : null))
    const asSame = runChallenger('sameBlock', values, RHYTHM_TODAY, conditions, CHALLENGER, (m, v, d, b) => (m === 'sameBlock' ? predict('sameBlock', v, d, b) : null))
    expect(asWay.base).toBe(LEVEL_WEEKDAY)
    expect(asWay.slots).toBeGreaterThan(20)
    expect({ ...asWay, base: null, adjustmentFor: null }).toEqual({ ...asSame, base: null, adjustmentFor: null })
    // Given no forecast for the way, it has nothing to try.
    const none = runChallenger(LEVEL_WEEKDAY, values, RHYTHM_TODAY, conditions)
    expect(none).toMatchObject({ slots: 0, picked: false, errors: [] })
  })

  it('moves a row of the way from the way’s own forecast, keeps it as the plain forecast, and keeps the way’s name and the four’s row', () => {
    const row: Forecast = { day: addDays(RHYTHM_TODAY, 1), block: 'morning', horizon: 1, madeOn: RHYTHM_TODAY, model: 'levelWeekday', point: 60, lo: 52, hi: 67, whatIf: null, four: { model: 'weekdayBlock', point: 58, lo: 50, hi: 66 } }
    const run: ChallengerRun = { base: LEVEL_WEEKDAY, slots: 30, days: 30, gain: 2, clear: 3, picked: true, errors: [-6, -3, -1, 0, 2, 5, 9], adjustmentFor: () => ({ points: -4, by: ['sleep.short'] }) }
    const forecastOf: Predict = (m) => (m === LEVEL_WEEKDAY ? 61.3 : null)
    const due = [{ ...row }]
    adjustRows(due, run, new Map(), forecastOf)
    // The band of [-6, -3, -1, 0, 2, 5, 9] is -3 to 2: 61.3 - 4 is 57.3.
    expect(due[0]).toEqual({ ...row, point: 57, lo: 54, hi: 59, adj: -4, adjBy: ['sleep.short'], plain: { point: 60, lo: 52, hi: 67 } })
    // With no forecast of the way given, the row is left as it was.
    const left = [{ ...row }]
    adjustRows(left, run, new Map())
    expect(left[0]).toEqual(row)
  })
})

describe('the document of the way (docs/week-ahead-weekdays.md)', () => {
  const doc = readFileSync(new URL('../docs/week-ahead-weekdays.md', import.meta.url), 'utf8')

  it('states the code’s numbers, the two verdicts’ fingerprints and the switch', () => {
    expect(doc).toContain(`| The window | ${WEEK.window} days |`)
    expect(doc).toContain('| The test’s chance | at most 1 in 1,000,000 |')
    expect(WEEK.chance).toBe(1 / 1_000_000)
    expect(doc).toContain(`| Least days of each weekday | ${WEEK.minDays} |`)
    expect(doc).toContain(`| The hold | ${WEEK.hold} days |`)
    expect(doc).toContain(`| The shrinking | ${WEEK.shrink} |`)
    expect(doc).toContain('f9dc57e83c05b239353fe2d84d27f6bdc5ed2a5d1bdf66a26c3ad192f1048107')
    expect(doc).toContain('bda7abeb74527e1372fd52813fcd2b910752c601d2678a4d28ac4b18bd3be381')
    expect(doc).toContain(`\`LEVEL_WEEKDAY_ON = ${LEVEL_WEEKDAY_ON}\``)
  })

  it('gives the way’s words exactly as the app says them', () => {
    expect(doc).toContain('`' + copy.brief.models.levelWeekday + '`')
    expect(doc).toContain('`' + copy.weekly.modelWeekdays + '`')
  })
})
