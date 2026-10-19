import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from '../blocks'
import { NOTHING } from '../catalogue'
import type { CheckIn, DayContext, Offer, Outcome } from '../db'
import { INGREDIENT_IDS } from '../score'
import { weekStateFrom } from './flow'
import type { RepairRecord } from './record'

// The learning week (stage R3), read from the record: an invitation stands once a running test has fitted a check-in on
// three of the last seven days; Yes starts a week of seven days; Not now keeps the next away for seven days; an
// invitation not answered stands. The engine's own rules, as the stress test passed them.

const START = '2026-09-01'
/** Whichever of the walk's tests the queue runs, it fits each check-in here. */
const FITS = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock']

function record(days: number, answers: Record<string, 'yes' | 'notNow'> = {}): RepairRecord {
  const checkins: CheckIn[] = []
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  const dayRecs: DayContext[] = []
  for (let d = 0; d < days; d++) {
    const day = addDays(START, d)
    dayRecs.push({ day, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '', ...(answers[day] ? { weekAnswer: answers[day] } : {}) } as DayContext)
    BLOCKS.forEach((block, b) => {
      const a = Object.fromEntries(INGREDIENT_IDS.map((r, i) => [r, 1 + ((d * 3 + b + i) % 5)])) as CheckIn['answers']
      checkins.push({ day, block, asked: Object.keys(a) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: a, activeMs: 0 })
      const id = offers.length + 1
      const moveId = (d + b) % 2 === 0 ? 'walk-ten' : NOTHING
      offers.push({ id, kind: 'block', day, block, at: 'x', situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: ['walk-ten', NOTHING], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 }, skippedAt: null, closedAt: null, seenAt: 'x', fits: FITS })
      outcomes.push({ offerId: id, moveId, day, block, at: 'x', outcome: 'done', why: null, passiveOutcome: null })
    })
  }
  return { checkins, offers, outcomes, days: dayRecs, weekAnswers: new Map(dayRecs.filter((x) => x.weekAnswer).map((x) => [x.day, x.weekAnswer === 'yes'])) }
}

/** The first day an invitation stands, in a record of `days` days with no answer given. */
function firstInvitation(days: number): string | null {
  const r = record(days)
  for (let d = 0; d < days; d++) if (weekStateFrom(r, addDays(START, d)).invitation) return addDays(START, d)
  return null
}

describe('the learning week, read from the record', () => {
  const first = firstInvitation(14)

  it('an invitation stands once a running test has fitted a check-in on three of the last seven days, and not before', () => {
    expect(first).not.toBeNull()
    const r = record(14)
    for (let d = 0; d < 3; d++) expect(weekStateFrom(r, addDays(START, d)).invitation).toBe(false)
  })

  it('not answered, it stands the next day too, and no week runs', () => {
    const r = record(14)
    const next = addDays(first as string, 1)
    expect(weekStateFrom(r, next)).toEqual({ invitation: true, weekDay: null })
  })

  it('Yes starts a week of seven days, counted from the day it was given, and asks nothing while it runs', () => {
    const r = record(16, { [first as string]: 'yes' })
    expect(weekStateFrom(r, first as string)).toEqual({ invitation: false, weekDay: 1 })
    expect(weekStateFrom(r, addDays(first as string, 3)).weekDay).toBe(4)
    expect(weekStateFrom(r, addDays(first as string, 6))).toEqual({ invitation: false, weekDay: 7 })
    expect(weekStateFrom(r, addDays(first as string, 7)).weekDay).toBeNull()
  })

  it('Not now keeps the next invitation away for seven days', () => {
    const r = record(20, { [first as string]: 'notNow' })
    for (let k = 0; k < 7; k++) expect(weekStateFrom(r, addDays(first as string, k))).toEqual({ invitation: false, weekDay: null })
  })
})
