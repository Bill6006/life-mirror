import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from '../blocks'
import { NOTHING } from '../catalogue'
import type { CheckIn, DayContext, Offer, Outcome } from '../db'
import { askedLift } from '../repair/engine'
import { coin, START } from '../repair/fixtures'
import { buildEngine, builtThrough, type RepairRecord } from '../repair/record'
import { liftable } from './quick'
import { INGREDIENT_IDS } from '../score'

// The asked term (Ask Life Mirror, stage A3; the agreed design's point 14): a test the owner asked about is lifted in the
// test queue, the lift halving every seven days, and at most one place is ever held by a test that entered on its lift.
// It is priority alone: on the same record every test's call is the same with marks as without, and with no marks the
// queue is exactly as before.

/** Four moves fitting every check-in (and any extra fit given, its move a candidate too), a fair draw each time between the walk and nothing extra. */
function record(days: number, asked: { key: string; day: string }[] = [], extraFits: string[] = []): RepairRecord {
  const fits = ['walk-ten|mood|nextBlock', 'walk-ten|energy|nextBlock', 'walk-ten|stress|nextBlock', 'nap-ten|energy|nextBlock', 'nap-ten|focus|nextBlock', 'message-a-friend|mood|nextBlock', 'stretch-five|stress|nextBlock', 'stretch-five|energy|nextBlock', ...extraFits]
  const candidates = ['walk-ten', 'nap-ten', 'message-a-friend', 'stretch-five', ...extraFits.map((k) => k.split('|')[0]), NOTHING]
  const chance = 1 / candidates.length
  const checkins: CheckIn[] = []
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  const dayRecs: DayContext[] = []
  for (let d = 0; d < days; d++) {
    const day = addDays(START, d)
    dayRecs.push({ day, weekday: 1, withHer: false, studyNight: false, churchDay: false, pickupTime: null, soloUntil: '', changed: false, createdAt: '' } as DayContext)
    BLOCKS.forEach((block, b) => {
      const a = Object.fromEntries(INGREDIENT_IDS.map((r, i) => [r, 1 + ((d * 3 + b + i) % 5)])) as CheckIn['answers']
      checkins.push({ day, block, asked: Object.keys(a) as never, startedAt: 'x', completedAt: 'x', updatedAt: 'x', answers: a, activeMs: 0 })
      const id = offers.length + 1
      const moveId = coin(d * 3 + b) ? 'walk-ten' : NOTHING
      offers.push({ id, kind: 'block', day, block, at: 'x', situationKey: 'stress|low', target: 'stress', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates, coinFlip: false, passiveId: null, whyNot: null, propensity: chance, propensities: Object.fromEntries(candidates.map((c) => [c, chance])), skippedAt: null, closedAt: null, seenAt: 'x', fits })
      outcomes.push({ offerId: id, moveId, day, block, at: 'x', outcome: 'done', why: null, passiveOutcome: null })
    })
  }
  return { checkins, offers, outcomes, days: dayRecs, weekAnswers: new Map(), ...(asked.length ? { asked } : {}) }
}

const through = (days: number) => addDays(START, days - 1)
const queueOf = (r: RepairRecord, days: number) => buildEngine(r, through(days), null, () => 0.5).engine.runningKeys()

describe('the asked term in the test queue', () => {
  it('changes nothing without a mark', () => {
    expect(queueOf(record(20, []), 20)).toEqual(queueOf(record(20), 20))
  })

  it('lifts a test asked about into a place it would not have taken, and keeps the other place by the queue’s own order', () => {
    const plain = queueOf(record(20), 20)
    expect(plain).toHaveLength(2)
    const plainMoves = new Set(plain.map((k) => k.split('|')[0]))
    // A test of a move the queue does not run, asked about early: it takes a place.
    const asked = 'message-a-friend|mood|nextBlock'
    expect(plainMoves.has('message-a-friend')).toBe(false)
    const lifted = queueOf(record(20, [{ key: asked, day: addDays(START, 1) }]), 20)
    expect(lifted).toContain(asked)
    expect(lifted).toHaveLength(2)
  })

  it('reaches the queue on the next rebuild when a mark is all that changed', () => {
    const asked = 'message-a-friend|mood|nextBlock'
    expect(builtThrough(record(20), through(20)).engine.runningKeys()).not.toContain(asked)
    expect(builtThrough(record(20, [{ key: asked, day: addDays(START, 1) }]), through(20)).engine.runningKeys()).toContain(asked)
  })

  it('spends no lifted place on a test the queue takes by its own order: a second test asked about still takes one', () => {
    const plain = queueOf(record(20), 20)
    const asked = 'message-a-friend|mood|nextBlock'
    const marks = [plain[0], asked].map((key) => ({ key, day: addDays(START, 1) }))
    const engine = buildEngine(record(20, marks), through(20), null, () => 0.5).engine
    expect(engine.runningKeys()).toEqual(expect.arrayContaining([plain[0], asked]))
    expect([...engine.testsNow().values()].filter((t) => t.lifted).map((t) => t.key)).toEqual([asked])
  })

  it('never takes a test over seven days into the queue, asked about or not: the card’s own-days line rests on it', () => {
    const seven = 'cancel-one-thing|stress|sevenDays'
    const engine = buildEngine(record(20, [{ key: seven, day: addDays(START, 1) }], [seven]), through(20), null, () => 0.5).engine
    expect(engine.testsNow().has(seven)).toBe(true)
    expect(engine.runningKeys()).not.toContain(seven)
    expect(engine.queueNext(10).map((t) => t.key)).not.toContain(seven)
    expect(liftable({ window: 'sevenDays' })).toBe(false)
    expect(liftable({ window: 'nextBlock' })).toBe(true)
  })

  it('holds at most one place by its lift, whatever is asked', () => {
    const marks = ['message-a-friend|mood|nextBlock', 'stretch-five|stress|nextBlock'].map((key) => ({ key, day: addDays(START, 1) }))
    const engine = buildEngine(record(20, marks), through(20), null, () => 0.5).engine
    expect([...engine.testsNow().values()].filter((t) => t.lifted)).toHaveLength(1)
    expect(engine.runningKeys().filter((k) => marks.some((m) => m.key === k))).toHaveLength(1)
  })

  it('fades: 1 on the day of the newest mark made by then, halving every seven days; nothing before a mark', () => {
    expect(askedLift([10], 10)).toBe(1)
    expect(askedLift([10], 17)).toBe(0.5)
    expect(askedLift([10], 24)).toBe(0.25)
    // Asked again: the newest mark counts, in whatever order the marks come.
    expect(askedLift([3, 10], 17)).toBe(0.5)
    expect(askedLift([10, 3], 17)).toBe(0.5)
    expect(askedLift([30], 20)).toBe(0)
    expect(askedLift([], 20)).toBe(0)
  })

  it('puts a test asked about today first among those waiting, the queue’s own last choice included', () => {
    const plain = buildEngine(record(30), through(30), null, () => 0.5).engine
    const waiting = plain.queueNext(10)
    expect(waiting.length).toBeGreaterThan(1)
    const last = waiting[waiting.length - 1].key
    expect(waiting[0].key).not.toBe(last)
    const asked = buildEngine(record(30, [{ key: last, day: through(30) }]), through(30), null, () => 0.5).engine
    expect(asked.queueNext(1)[0].key).toBe(last)
  })

  it('is priority alone: on the same record, every test’s call is the same with marks as without', () => {
    const marks = ['message-a-friend|mood|nextBlock', 'stretch-five|stress|nextBlock'].map((key) => ({ key, day: addDays(START, 2) }))
    const calls = (r: RepairRecord) => {
      const e = buildEngine(r, through(30), null, () => 0.5).engine
      return [...e.testsNow().values()].map((t) => {
        const c = e.callOfTest(t)
        return [t.key, c.level, c.direction, c.theta, c.n1, c.n0]
      })
    }
    expect(calls(record(30, marks))).toEqual(calls(record(30)))
  })
})
