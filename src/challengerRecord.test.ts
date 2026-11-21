import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import type { ChallengerRun } from './challenger'
import { adjustRows, conditionsFor, eveningCondition, EVENING_ID, nightCandidates, nightCondition, SLEEP_ID, sleepCondition, type ChallengerRecord } from './challengerRecord'
import { fixtureCheckin } from './challengerTesting'
import { seeded } from './counted/compare'
import type { CheckIn, Forecast } from './db'
import { errorBand, predict } from './forecast'
import { slotKey } from './observe'
import type { Position } from './readings'
import { bandOf, readingOf } from './score'

// The challenger's list read from a record (2026-11-14). Stand-in check-ins only.

const TODAY = '2026-09-18'
const day = (back: number): string => addDays(TODAY, -back)
const record = (checkins: readonly CheckIn[], hideFaith = false): ChallengerRecord => ({ checkins, contexts: new Map(), eveningWorkouts: new Set(), natureMoves: new Set(), hideFaith })
const withExtras = (c: CheckIn, extras: NonNullable<CheckIn['extras']>): CheckIn => ({ ...c, extras })

describe('the challenger’s first two conditions, read from the record', () => {
  it('reads a short night from the day’s own morning answer, and nothing where there is none', () => {
    const noAnswer = fixtureCheckin(day(3), 'morning', 3)
    delete noAnswer.answers.sleepHours
    const unfinished: CheckIn = { ...fixtureCheckin(day(2), 'morning', 3, 1), completedAt: null }
    const c = sleepCondition([fixtureCheckin(day(6), 'morning', 3, 1), fixtureCheckin(day(5), 'morning', 3, 2), fixtureCheckin(day(4), 'morning', 3, 3), noAnswer, unfinished, fixtureCheckin(day(1), 'evening', 3)])
    expect(c.id).toBe(SLEEP_ID)
    expect([6, 5, 4, 3, 2, 1, 0].map((back) => c.stateOn(day(back)))).toEqual(['short', 'short', 'not', null, 'short', null, null])
    expect(c.blocks).toEqual(BLOCKS)
    expect(c.moves('not')).toBe(true)
  })

  it('reads the evening by its band from the complete evening check-in, completed before the next day began', () => {
    const low = fixtureCheckin(day(3), 'evening', 1)
    const high = fixtureCheckin(day(2), 'evening', 5)
    const unfinished: CheckIn = { ...fixtureCheckin(day(4), 'evening', 3), completedAt: null }
    // Logged the next morning at nine: after that day had begun, so it was not known at its start.
    const late: CheckIn = { ...fixtureCheckin(day(5), 'evening', 3), completedAt: new Date(`${day(4)}T09:00:00`).toISOString() }
    const c = eveningCondition([low, high, unfinished, late, fixtureCheckin(day(1), 'morning', 3, 3)])
    expect(c.id).toBe(EVENING_ID)
    expect(c.stateOn(day(3))).toBe(bandOf(readingOf(low)?.value as number))
    expect(c.stateOn(day(2))).toBe(bandOf(readingOf(high)?.value as number))
    expect([5, 4, 1].map((back) => c.stateOn(day(back)))).toEqual([null, null, null])
  })
})

/** Sixty days in no rhythm: after an evening with a late dinner the morning reads far lower, the evenings themselves all alike. */
function dinners(extraToday: readonly CheckIn[] = []): CheckIn[] {
  const next = seeded(5)
  const dinner = Array.from({ length: 60 }, () => next() < 0.4)
  const rows: CheckIn[] = []
  for (let i = 0; i < 60; i++) {
    const d = addDays(TODAY, i - 60)
    rows.push(fixtureCheckin(d, 'morning', (i > 0 && dinner[i - 1] ? 1 : 5) as Position, 4))
    rows.push(withExtras(fixtureCheckin(d, 'evening', 3), dinner[i] ? { dinner: true } : {}))
  }
  return [...rows, ...extraToday]
}

describe('the challenger’s kinds, read from the record', () => {
  it('puts a thing of last night on the list only when its comparison for the next morning stands at a steady pattern', () => {
    const ids = (r: ChallengerRecord): string[] => conditionsFor(r, TODAY).map((c) => c.id)
    expect(ids(record(dinners()))).toEqual([SLEEP_ID, EVENING_ID, 'night.dinner'])
    // The same evenings with mornings that do not follow them: the first two alone.
    const quiet = dinners().map((c) => (c.block === 'morning' ? fixtureCheckin(c.day, 'morning', 3, 4) : c))
    expect(ids(record(quiet))).toEqual([SLEEP_ID, EVENING_ID])
  })

  it('works the standings out from the days before the day of the run alone', () => {
    const before = nightCandidates(record(dinners()), TODAY)
    // Today's morning, whatever it reads, is yesterday evening's outcome: it enters no comparison made today.
    for (const mood of [1, 5] as Position[]) expect(nightCandidates(record(dinners([fixtureCheckin(TODAY, 'morning', mood, 4)])), TODAY)).toEqual(before)
    // The probe that can say yes: read a day later, the same morning does enter.
    expect(nightCandidates(record(dinners([fixtureCheckin(TODAY, 'morning', 1, 4)])), addDays(TODAY, 1))).not.toEqual(before)
  })

  it('never takes the church day as a candidate while faith is hidden', () => {
    expect(nightCandidates(record(dinners()), TODAY).some((c) => c.key === 'churchDay')).toBe(true)
    expect(nightCandidates(record(dinners(), true), TODAY).some((c) => c.key === 'churchDay')).toBe(false)
    expect(nightCandidates(record(dinners(), true), TODAY)).toHaveLength(11)
  })

  it('says a thing was present, absent, or unknown from the evening’s own record, and moves only the morning after it was present', () => {
    const rows = [withExtras(fixtureCheckin(day(3), 'evening', 3), { dinner: true }), fixtureCheckin(day(2), 'evening', 3), { ...fixtureCheckin(day(1), 'evening', 3), answers: {} }]
    const dinner = nightCondition('dinner', record(rows))
    expect([3, 2, 1, 0].map((back) => dinner.stateOn(day(back)))).toEqual(['yes', 'no', null, null])
    expect(dinner.blocks).toEqual(['morning'])
    expect([dinner.moves('yes'), dinner.moves('no')]).toEqual([true, false])
    // Caffeine is known only at an evening that showed it: one that never did is unknown, never "no".
    const caffeine = nightCondition('caffeine', record([withExtras(fixtureCheckin(day(3), 'evening', 3), { caffeineIntake: true } as never), withExtras(fixtureCheckin(day(2), 'evening', 3), { caffeineShown: true } as never), fixtureCheckin(day(1), 'evening', 3)]))
    expect([3, 2, 1].map((back) => caffeine.stateOn(day(back)))).toEqual(['yes', 'no', null])
  })
})

describe('the rows the challenger adjusts', () => {
  it('adds its points to the base way’s forecast, takes the range from its own misses, keeps the way’s name, and leaves every other row as it was', () => {
    const values = new Map<string, number>()
    for (let back = 1; back <= 20; back++) for (const b of BLOCKS) values.set(slotKey(day(back), b), 40 + (back % 5))
    const row = (block: Forecast['block'], d: string, horizon: number): Forecast => ({ day: d, block, horizon, madeOn: TODAY, model: 'sameBlock', point: 42, lo: 40, hi: 44, whatIf: null })
    const due = [row('morning', TODAY, 0), row('evening', TODAY, 0), row('morning', addDays(TODAY, 3), 3)]
    const untouched = JSON.stringify(due.slice(1))
    const run: ChallengerRun = { base: 'sameBlock', slots: 30, days: 30, gain: 2, clear: 3, picked: true, errors: [-6, -3, -1, 0, 2, 5, 9], adjustmentFor: (d, block) => (d === TODAY && block === 'morning' ? { points: -3.26, by: [SLEEP_ID] } : { points: 0, by: [] }) }
    adjustRows(due, run, values)
    const p = predict('sameBlock', values, TODAY, 'morning') as number
    const band = errorBand(run.errors)
    expect(band).toEqual({ lo: -3, hi: 2 })
    // From Batch 3 (2026-11-21) the row also keeps the plain forecast it was moved from: the base way's row as it stood.
    expect(due[0]).toEqual({ ...row('morning', TODAY, 0), point: Math.round(p - 3.26), lo: Math.round(p - 3.26 - 3), hi: Math.round(p - 3.26 + 2), adj: -3.3, adjBy: [SLEEP_ID], plain: { point: 42, lo: 40, hi: 44 } })
    expect(due[0].point).not.toBe(Math.round(p))
    expect(JSON.stringify(due.slice(1))).toBe(untouched)
  })
})
