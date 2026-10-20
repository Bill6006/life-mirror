import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS, type Block } from '../blocks'
import { NOTHING } from '../catalogue'
import type { CheckIn, DayContext, Offer, Outcome } from '../db'
import { SHORT_SLEEP } from '../facts'
import { INGREDIENT_IDS } from '../score'
import { buildEngine, contextOf, isDraw, responseOf, SHORT_SLEEP_ANCHOR, type RepairRecord } from './record'

// The learning repair read from the app's record (stage R2). The engine's math is proved equal to the judged engine's by
// stress/equivalence.ts; these tests hold the record's own rules: what counts as a randomized decision, what an answer
// means, the day's context, and a rebuild that depends on the record alone.

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 1,
  kind: 'block',
  day: '2026-09-01',
  block: 'morning',
  at: 'x',
  situationKey: 'stress|low',
  target: 'stress',
  stance: '',
  band: 'low',
  reading: 2,
  moveId: 'walk-ten',
  cardId: null,
  candidates: ['walk-ten', NOTHING],
  coinFlip: false,
  passiveId: null,
  whyNot: null,
  propensity: 0.5,
  propensities: { 'walk-ten': 0.5, [NOTHING]: 0.5 },
  skippedAt: null,
  closedAt: null,
  ...over,
})

const outcome = (over: Partial<Outcome> = {}): Outcome => ({ offerId: 1, moveId: 'walk-ten', day: '2026-09-01', block: 'morning', at: 'x', outcome: 'done', why: null, passiveOutcome: null, ...over })

describe('what the repair reads as a randomized decision', () => {
  it('a check-in draw with every chance recorded and nothing extra among its candidates', () => {
    expect(isDraw(offer())).toBe(true)
  })
  it('not a replacement after a skip, drawn among real moves alone', () => {
    expect(isDraw(offer({ candidates: ['walk-ten', 'nap-ten'] }))).toBe(false)
  })
  it('not a move set aside when the day changed, nor a draw with no chances recorded, nor a session', () => {
    expect(isDraw(offer({ skipReason: 'dayChanged', skippedAt: 'x' }))).toBe(false)
    expect(isDraw(offer({ propensities: undefined }))).toBe(false)
    expect(isDraw(offer({ kind: 'session' as Offer['kind'] }))).toBe(false)
  })
})

describe('what became of a draw', () => {
  it('a skip is a seen No; a skip for Not home was never applicable and stays out', () => {
    expect(responseOf(offer({ skippedAt: 'x' }), undefined)).toEqual({ seen: true, did: 'no', why: null, answered: true })
    expect(responseOf(offer({ skippedAt: 'x', skipReason: 'notHome' }), undefined)).toEqual({ seen: false, did: null, why: null, answered: false })
  })
  it('seen from the card on screen, or from an answer that says so', () => {
    expect(responseOf(offer({ seenAt: 'x' }), outcome({ outcome: 'partly' }))).toEqual({ seen: true, did: 'partly', why: null, answered: true })
    expect(responseOf(offer(), outcome({ seen: true, outcome: 'no', why: 'noTime' }))).toEqual({ seen: true, did: 'no', why: 'noTime', answered: true })
  })
  it('an answer from before the seen mark counts as seen once given', () => {
    expect(responseOf(offer(), outcome({ outcome: 'done' }))).toEqual({ seen: true, did: 'done', why: null, answered: true })
  })
  it('seen and never answered: in the comparison, with nothing said of what was done', () => {
    expect(responseOf(offer({ seenAt: 'x' }), undefined)).toEqual({ seen: true, did: null, why: null, answered: false })
  })
  it('not seen, or an answer that says it was not: out of the comparison', () => {
    expect(responseOf(offer(), undefined).seen).toBe(false)
    expect(responseOf(offer(), outcome({ seen: false })).seen).toBe(false)
  })
})

describe("the day's context", () => {
  const morning = (sleep: number): CheckIn => ({ day: '2026-09-05', block: 'morning', startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: { sleepHours: sleep } as CheckIn['answers'], activeMs: 0 })
  it('weekday and weekend from the date; short sleep only from an answered morning', () => {
    const sat = contextOf('2026-09-05', undefined, morning(SHORT_SLEEP_ANCHOR))
    expect(sat).toMatchObject({ weekday: 6, weekend: true, shortSleep: true })
    expect(contextOf('2026-09-05', undefined, morning(SHORT_SLEEP_ANCHOR + 1)).shortSleep).toBe(false)
    expect(contextOf('2026-09-07', undefined, undefined)).toMatchObject({ weekday: 1, weekend: false, shortSleep: false })
  })
  it("the day's own marks: with her, office, church, study night, daycare by a pickup, away on a trip", () => {
    const rec = { day: '2026-09-07', weekday: 1, withHer: true, studyNight: true, churchDay: false, atOffice: true, pickupTime: '17:30', soloUntil: '', awayFromHome: { held: {} } } as unknown as DayContext
    expect(contextOf('2026-09-07', rec, undefined)).toMatchObject({ withHer: true, office: true, church: false, studyNight: true, daycare: true, away: true })
  })
  it('short sleep reads the same anchor as the draw record', () => {
    expect(SHORT_SLEEP_ANCHOR).toBe(SHORT_SLEEP)
  })
})

describe('the engine rebuilt from the record', () => {
  const answers = (k: number) => Object.fromEntries(INGREDIENT_IDS.map((r, i) => [r, 1 + ((k + i) % 5)])) as CheckIn['answers']
  function record(days: number): RepairRecord {
    const checkins: CheckIn[] = []
    const offers: Offer[] = []
    const outcomes: Outcome[] = []
    for (let d = 0; d < days; d++) {
      const day = addDays('2026-09-01', d)
      BLOCKS.forEach((block: Block, b) => {
        const a = answers(d * 3 + b)
        checkins.push({ day, block, asked: Object.keys(a) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: a, activeMs: 0 })
        const id = offers.length + 1
        const moveId = (d + b) % 2 === 0 ? 'walk-ten' : NOTHING
        offers.push(offer({ id, day, block, moveId, seenAt: 'x' }))
        outcomes.push(outcome({ offerId: id, moveId, day, block, outcome: moveId === NOTHING ? 'done' : (d + b) % 3 === 0 ? 'partly' : 'done' }))
      })
    }
    return { checkins, offers, outcomes, days: [], weekAnswers: new Map() }
  }
  it("every draw is replayed: the move's tests hold a decision per draw on each of its readings", () => {
    const built = buildEngine(record(12), '2026-09-12')
    expect(built.epoch).toBe('2026-09-01')
    expect(built.ids.size).toBe(36)
    const stress = built.engine.testsNow().get('walk-ten|stress|nextBlock')
    expect(stress?.decisions.length).toBe(36)
  })
  it('a rebuild depends on the record alone: twice gives the same calls', () => {
    const r = record(30)
    const run = () => {
      const days: string[] = []
      buildEngine(r, '2026-09-30', null, () => 0.5, undefined, (_d, calls) => days.push(JSON.stringify(calls)))
      return days
    }
    expect(run()).toEqual(run())
  })
  it("stopping before a slot observes its check-in and leaves its draw out: the state a new draw there starts from", () => {
    const r = record(3)
    const full = buildEngine(r, '2026-09-03')
    const before = buildEngine(r, '2026-09-03', 'afternoon')
    expect(full.ids.size).toBe(9)
    expect(before.ids.size).toBe(7)
  })
  it('a draw set aside when the day changed is never replayed, and its redraw is', () => {
    const r = record(2)
    const offers = [...r.offers]
    offers[0] = { ...offers[0], skippedAt: 'x', skipReason: 'dayChanged' }
    offers.push(offer({ id: 99, day: '2026-09-01', block: 'morning', moveId: NOTHING, redrawn: true }))
    const built = buildEngine({ ...r, offers }, '2026-09-02')
    expect(built.ids.has(1)).toBe(false)
    expect(built.ids.has(99)).toBe(true)
  })
})
