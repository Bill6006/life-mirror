import { describe, expect, it } from 'vitest'
import { BLOCKS, type Block } from './blocks'
import { CHALLENGER, CHALLENGER_ON, kindsAtPattern, runChallenger, type ChallengerNumbers, type Condition } from './challenger'
import { seeded, type Compared } from './counted/compare'
import { BACKTEST_DAYS, MODELS, predict } from './forecast'
import { slotKey } from './observe'

// The forecast's one challenger, on hand-worked and seeded records (2026-11-14). Stand-in numbers only.

const dayName = (d: number): string => new Date(Date.UTC(2031, 0, 6 + d)).toISOString().slice(0, 10)
const flat = (): number => 50
/** A condition read from a list by day: "yes", "no", or null where the list holds nothing. */
const fromList = (id: string, list: readonly (boolean | null)[], blocks: readonly Block[] = ['morning'], moves: (s: string) => boolean = () => true): Condition => ({
  id,
  blocks,
  stateOn: (day) => {
    const d = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.UTC(2031, 0, 6)) / 86_400_000)
    const v = list[d]
    return v === null || v === undefined ? null : v ? 'yes' : 'no'
  },
  moves,
})

/** Twenty mornings: after a day that carried the thing the morning reads 60, after a day without it 50; the forecast is a flat 50. */
function twenty(): { values: Map<string, number>; thing: boolean[] } {
  const thing = Array.from({ length: 21 }, (_, d) => d % 2 === 0)
  const values = new Map<string, number>()
  for (let d = 1; d <= 20; d++) values.set(slotKey(dayName(d), 'morning'), thing[d - 1] ? 60 : 50)
  return { values, thing }
}

describe('the challenger: the numbers its simulation set', () => {
  it('is switched off, and holds the numbers as they were set', () => {
    expect(CHALLENGER_ON).toBe(false)
    expect(CHALLENGER).toEqual({ window: 180, minState: 8, shrink: 4, eachCheckin: true, minSlots: 20, minGain: 0.5, minClear: 2.4, maxKinds: 3 })
  })
})

describe('the challenger: an adjustment', () => {
  it('is the state’s average miss less the average over every known day, cut by its own uncertainty', () => {
    const { values, thing } = twenty()
    const run = runChallenger('sameBlock', values, dayName(21), [fromList('thing', thing)], CHALLENGER, flat)
    // Ten mornings after it missed by 10 and ten without it by 0: 10 less the average 5 is 5. The misses' spread is 500 over 19; times (1/10 - 1/20) is 1.3158; four times that over 25 leaves 0.7895 of the 5.
    const a = run.adjustmentFor(dayName(21), 'morning')
    expect(a.points).toBeCloseTo(3.947, 3)
    expect(a.by).toEqual(['thing'])
    // The morning after a day without it: 0 less 5, cut the same way.
    expect(runChallenger('sameBlock', values, dayName(22), [fromList('thing', [...thing, false])], CHALLENGER, flat).adjustmentFor(dayName(22), 'morning').points).toBeCloseTo(-3.947, 3)
  })

  it('is nothing under eight days in the state, or eight outside it', () => {
    const values = new Map<string, number>()
    const thing: boolean[] = []
    // Seven days with it among twenty: one short of the minimum.
    for (let d = 0; d <= 20; d++) thing.push(d < 14 && d % 2 === 0)
    for (let d = 1; d <= 20; d++) values.set(slotKey(dayName(d), 'morning'), thing[d - 1] ? 70 : 50 + (d % 3))
    thing[20] = true
    expect(thing.slice(0, 20).filter(Boolean)).toHaveLength(7)
    expect(runChallenger('sameBlock', values, dayName(21), [fromList('thing', thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'morning')).toEqual({ points: 0, by: [] })
    // With the minimum at seven the same record adjusts: the rule is what held it.
    expect(runChallenger('sameBlock', values, dayName(21), [fromList('thing', thing)], { ...CHALLENGER, minState: 7 }, flat).adjustmentFor(dayName(21), 'morning').points).toBeGreaterThan(5)
    // The other half: seven days outside the state among twenty.
    const mostly: boolean[] = []
    const others = new Map<string, number>()
    for (let d = 0; d <= 20; d++) mostly.push(!(d < 14 && d % 2 === 0))
    for (let d = 1; d <= 20; d++) others.set(slotKey(dayName(d), 'morning'), mostly[d - 1] ? 50 + (d % 3) : 70)
    mostly[20] = true
    expect(mostly.slice(0, 20).filter((v) => !v)).toHaveLength(7)
    expect(runChallenger('sameBlock', others, dayName(21), [fromList('thing', mostly)], CHALLENGER, flat).adjustmentFor(dayName(21), 'morning')).toEqual({ points: 0, by: [] })
    expect(runChallenger('sameBlock', others, dayName(21), [fromList('thing', mostly)], { ...CHALLENGER, minState: 7 }, flat).adjustmentFor(dayName(21), 'morning').points).toBeLessThan(-3)
  })

  it('is nothing where the difference is within its own noise', () => {
    const next = seeded(11)
    const values = new Map<string, number>()
    const thing = Array.from({ length: 61 }, () => next() < 0.5)
    for (let d = 1; d <= 60; d++) values.set(slotKey(dayName(d), 'morning'), 50 + Math.round(40 * (next() - 0.5)))
    const run = runChallenger('sameBlock', values, dayName(61), [fromList('thing', thing)], CHALLENGER, flat)
    expect(run.adjustmentFor(dayName(61), 'morning')).toEqual({ points: 0, by: [] })
    // The same record with no shrinking does adjust: the shrinking is what held it.
    expect(runChallenger('sameBlock', values, dayName(61), [fromList('thing', thing)], { ...CHALLENGER, shrink: 0 }, flat).adjustmentFor(dayName(61), 'morning').points).not.toBe(0)
  })

  it('moves nothing where the record cannot speak for the condition', () => {
    const { values, thing } = twenty()
    const unknown = thing.map((v, d) => (d === 20 ? null : v))
    const run = runChallenger('sameBlock', values, dayName(21), [fromList('thing', unknown)], CHALLENGER, flat)
    expect(run.adjustmentFor(dayName(21), 'morning')).toEqual({ points: 0, by: [] })
    // And a day further out, whose day before has not happened.
    expect(run.adjustmentFor(dayName(23), 'morning')).toEqual({ points: 0, by: [] })
  })

  it('a kind moves only the morning after it was present, and only the morning', () => {
    const { values, thing } = twenty()
    const kind = (list: readonly (boolean | null)[]): Condition => fromList('kind', list, ['morning'], (s) => s === 'yes')
    expect(runChallenger('sameBlock', values, dayName(21), [kind(thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'morning').points).toBeCloseTo(3.947, 3)
    expect(runChallenger('sameBlock', values, dayName(22), [kind([...thing, false])], CHALLENGER, flat).adjustmentFor(dayName(22), 'morning')).toEqual({ points: 0, by: [] })
    expect(runChallenger('sameBlock', values, dayName(21), [kind(thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'evening')).toEqual({ points: 0, by: [] })
    // On a record whose evenings follow the thing as its mornings do, a condition of the morning alone still leaves the evening as it was; one of every check-in moves it.
    const both = new Map(values)
    for (let d = 1; d <= 20; d++) both.set(slotKey(dayName(d), 'evening'), thing[d - 1] ? 60 : 50)
    expect(runChallenger('sameBlock', both, dayName(21), [kind(thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'evening')).toEqual({ points: 0, by: [] })
    expect(runChallenger('sameBlock', both, dayName(21), [fromList('kind', thing, BLOCKS, (s) => s === 'yes')], CHALLENGER, flat).adjustmentFor(dayName(21), 'evening').points).toBeCloseTo(3.947, 3)
  })

  it('takes the conditions in order, each learning from what the one before it left', () => {
    const { values, thing } = twenty()
    const one = runChallenger('sameBlock', values, dayName(21), [fromList('first', thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'morning')
    const two = runChallenger('sameBlock', values, dayName(21), [fromList('first', thing), fromList('second', thing)], CHALLENGER, flat).adjustmentFor(dayName(21), 'morning')
    // The same condition twice is not counted twice: the second explains only what the first left on the days it had already adjusted.
    expect(two.points).toBeLessThan(2 * one.points - 0.5)
    expect(two.points).toBeGreaterThan(one.points)
    expect(two.by).toEqual(['first', 'second'])
  })
})

/** A seeded record of three check-ins a day, with a thing whose mornings after read higher by `lift`. */
function seededRecord(seed: number, days: number, lift: number): { values: Map<string, number>; thing: boolean[]; sleep: (boolean | null)[] } {
  const next = seeded(seed)
  const values = new Map<string, number>()
  const thing = Array.from({ length: days + 1 }, () => next() < 0.35)
  const sleep = Array.from({ length: days + 1 }, () => (next() < 0.1 ? null : next() < 0.25))
  for (let d = 0; d < days; d++)
    for (const b of BLOCKS) {
      const u = next()
      const v = next()
      if (u < 0.12) continue
      values.set(slotKey(dayName(d), b), Math.max(0, Math.min(100, Math.round(52 + 30 * (v - 0.5) + (b === 'morning' && d > 0 && thing[d - 1] ? lift : 0)))))
    }
  return { values, thing, sleep }
}

describe('the challenger: nothing on or after a day moves that day’s forecast', () => {
  it('holds for every way and for the challenger’s adjustments, on seeded records', () => {
    let movedByTheDayBefore = 0
    for (const seed of [3, 4, 5, 6]) {
      const days = 90
      const { values, thing, sleep } = seededRecord(seed, days, 14)
      const conditions = (): Condition[] => [fromList('sleep', sleep, BLOCKS), fromList('thing', thing, ['morning'], (s) => s === 'yes')]
      for (const d of [45, 60, 75, 89]) {
        const day = dayName(d)
        // One run a read: its adjustments and its record are the same run's.
        const read = (): unknown => {
          const run = runChallenger('sameBlock', values, day, conditions())
          return {
            ways: MODELS.map((m) => BLOCKS.map((b) => predict(m, values, day, b))),
            adjusted: BLOCKS.map((b) => run.adjustmentFor(day, b)),
            run: (({ slots, gain, clear, picked, errors }) => ({ slots, gain, clear, picked, errors }))(run),
          }
        }
        const before = JSON.stringify(read())
        // Every value on the day and after it is changed or taken away, and so is every condition's own record.
        const next = seeded(seed * 100 + d)
        const kept = new Map(values)
        const keptThing = [...thing]
        const keptSleep = [...sleep]
        for (let later = d; later < days + 1; later++) {
          for (const b of BLOCKS) {
            if (next() < 0.3) values.delete(slotKey(dayName(later), b))
            else values.set(slotKey(dayName(later), b), Math.round(100 * next()))
          }
          thing[later] = !thing[later]
          sleep[later] = sleep[later] === null ? true : null
        }
        expect(JSON.stringify(read())).toBe(before)
        // The probe that can say yes: a change the day before does move it.
        thing[d - 1] = !thing[d - 1]
        sleep[d - 1] = sleep[d - 1] === true ? false : true
        for (const b of BLOCKS) values.set(slotKey(dayName(d - 1), b), 5)
        if (JSON.stringify(read()) !== before) movedByTheDayBefore++
        values.clear()
        kept.forEach((v, k) => values.set(k, v))
        thing.splice(0, thing.length, ...keptThing)
        sleep.splice(0, sleep.length, ...keptSleep)
      }
    }
    expect(movedByTheDayBefore).toBe(16)
    // Sixteen days of a seeded record each read three times: under a whole suite's load this takes seconds, so it has its own time.
  }, 30_000)
})

describe('the challenger: the pick', () => {
  const { values, thing, sleep } = seededRecord(22, 150, 16)
  const conditions: Condition[] = [fromList('sleep', sleep, BLOCKS), fromList('thing', thing, ['morning'], (s) => s === 'yes')]
  const tried = (numbers: ChallengerNumbers = CHALLENGER) => runChallenger('sameBlock', values, dayName(150), conditions, numbers)

  it('picks it when the gain clears the margin over enough slots', () => {
    const run = tried()
    expect(run.picked).toBe(true)
    expect(run.slots).toBeGreaterThanOrEqual(20)
    expect(run.gain as number).toBeGreaterThanOrEqual(0.5)
    expect(run.clear as number).toBeGreaterThanOrEqual(2.4)
  })

  it('holds each of the margin’s three numbers alone', () => {
    const run = tried()
    expect(tried({ ...CHALLENGER, minSlots: run.slots }).picked).toBe(true)
    expect(tried({ ...CHALLENGER, minSlots: run.slots + 1 }).picked).toBe(false)
    expect(tried({ ...CHALLENGER, minGain: (run.gain as number) + 0.01 }).picked).toBe(false)
    expect(tried({ ...CHALLENGER, minClear: (run.clear as number) + 0.01 }).picked).toBe(false)
  })

  it('reads its clearance as the gain over its own day-to-day spread, whatever the scale', () => {
    const run = tried()
    // On this seeded record: 37 slots, 4.22 points a slot, 5.6 of its own spread clear.
    expect(run.slots).toBe(37)
    expect(run.gain as number).toBeCloseTo(4.221, 2)
    expect(run.clear as number).toBeCloseTo(5.615, 2)
    // The same record with every reading twice as far from 50: every miss doubles, so the gain doubles and the clearance, a ratio, stays.
    const doubled = new Map([...values].map(([key, v]) => [key, 50 + 2 * (v - 50)]))
    const wide = runChallenger('sameBlock', doubled, dayName(150), conditions)
    expect(wide.slots).toBe(37)
    expect(wide.gain as number).toBeCloseTo(2 * (run.gain as number), 6)
    expect(wide.clear as number).toBeCloseTo(run.clear as number, 6)
  })

  it('is not picked on a record whose thing says nothing', () => {
    const quiet = seededRecord(22, 150, 0)
    const run = runChallenger('sameBlock', quiet.values, dayName(150), [fromList('sleep', quiet.sleep, BLOCKS), fromList('thing', quiet.thing, ['morning'], (s) => s === 'yes')])
    expect(run.picked).toBe(false)
  })

  it('takes its range from its own misses over the back-test’s days alone', () => {
    const run = tried()
    const scored = BLOCKS.reduce((n, b) => n + Array.from({ length: BACKTEST_DAYS }, (_, i) => dayName(149 - i)).filter((day) => values.has(slotKey(day, b)) && predict('sameBlock', values, day, b) !== null).length, 0)
    expect(run.errors).toHaveLength(scored)
    expect(scored).toBeGreaterThan(60)
    // They are its own misses, not the base way's: on the slots it adjusted the two differ.
    const baseMisses: number[] = []
    for (let back = BACKTEST_DAYS; back >= 1; back--)
      for (const b of BLOCKS) {
        const actual = values.get(slotKey(dayName(150 - back), b))
        const p = predict('sameBlock', values, dayName(150 - back), b)
        if (actual !== undefined && p !== null) baseMisses.push(actual - p)
      }
    expect(baseMisses).toHaveLength(scored)
    expect(run.errors.filter((e, i) => Math.abs(e - baseMisses[i]) > 1).length).toBeGreaterThanOrEqual(3)
  })

  it('looks back over the window and no further', () => {
    // A window of 30 days learns only from them: the run differs from the whole record's, and equals the run on a record that holds nothing older.
    const short = tried({ ...CHALLENGER, window: 30 })
    expect(short.slots).toBeLessThan(tried().slots)
    const recent = new Map([...values].filter(([key]) => key.slice(0, 10) >= dayName(64)))
    const sameWays = (model: 'sameBlock', _v: ReadonlyMap<string, number>, day: string, block: Block) => predict(model, values, day, block)
    const cut = runChallenger('sameBlock', recent, dayName(150), conditions, { ...CHALLENGER, window: 30 }, sameWays as never)
    expect({ slots: cut.slots, gain: cut.gain, clear: cut.clear }).toEqual({ slots: short.slots, gain: short.gain, clear: short.clear })
  })
})

describe('the challenger: the kinds that join', () => {
  const one = (id: string, diff: number, p: number): Compared => ({ id, n: 30, m: 60, diff, enough: true, p, worth: 10 })

  it('takes only kinds at a steady pattern, in the family’s order, three at most', () => {
    const family = [one('a', 12, 0.0005), one('small', 6, 0.0005), one('b', -14, 0.0005), one('lead', 12, 0.04), one('c', 11, 0.0005), one('d', 15, 0.0005), one('chance', 12, 0.5)]
    // "small" is under the size worth saying; "lead" clears chance alone and not after the family's correction; "chance" does not clear it at all.
    expect(kindsAtPattern(family)).toEqual(['a', 'b', 'c'])
    expect(kindsAtPattern(family, 2)).toEqual(['a', 'b'])
    expect(kindsAtPattern([one('lead', 12, 0.04), one('other', 12, 0.5)])).toEqual([])
  })

  it('takes none from a family with nothing tested', () => {
    expect(kindsAtPattern([{ id: 'few', n: 3, m: 60, diff: 20, enough: false, p: null, worth: 10 }])).toEqual([])
  })
})
