import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeAims, addAim, resumeAim } from './aimFlow'
import { stepFor } from './aims'
import { db, ensureDayContext, getSettings, saveAnswer, setDayContext, updateSettings, type Aim, type CheckIn, type Offer } from './db'
import { ensureOffer, ensurePickupOffer, markOfferSeen, recordDoneNow, recordOutcome } from './offerFlow'
import { NOTHING } from './offers'
import { drawContextOf, drawRecordOf, outcomeReasonOf } from './provenance'
import { blockReadings } from './readings'
import { REPAIR_ENGINE } from './repair/record'

// Requirement 2 of the learning design agreed 2026-10-10, the foundations: each decision point
// recorded at the time, since history recorded without them cannot be rebuilt. Recorded only:
// nothing here changes what is drawn, offered or said.

const DAY = '2026-09-18'
const asked = blockReadings('afternoon')

function checkin(day: string, block: CheckIn['block'], answers: CheckIn['answers']): CheckIn {
  return { day, block, answers, startedAt: `${day}T12:00:00.000Z`, completedAt: `${day}T12:01:00.000Z`, updatedAt: `${day}T12:01:00.000Z`, activeMs: 60_000 }
}

describe('the record of a draw', () => {
  it('groups the moves left out by why, keeps each candidate’s belief, and says what the move drawn was for', () => {
    const r = drawRecordOf({
      excluded: new Map([['walk-ten', 'offeredToday'], ['nap-ten', 'block'], ['green-walk', 'block']] as const),
      candidates: ['box-breathing', NOTHING],
      belief: (id) => (id === NOTHING ? { mean: 0, sd: 0.5, n: 0 } : { mean: 0.123456, sd: 0.4567891, n: 3 }),
      target: 'stress',
      window: 'nextBlock',
      context: drawContextOf(null, [], DAY),
      checkins: [],
      day: DAY,
      block: 'afternoon',
      engine: REPAIR_ENGINE,
    })
    expect(r.engine).toBe(REPAIR_ENGINE)
    expect(r.excluded).toEqual({ offeredToday: ['walk-ten'], block: ['nap-ten', 'green-walk'] })
    expect(r.beliefs).toEqual({ 'box-breathing': { mean: 0.123, sd: 0.457, n: 3 }, nothing: { mean: 0, sd: 0.5, n: 0 } })
    // Stress is better lower: the move was drawn to bring it down, read at the next check-in.
    expect(r.intended).toEqual({ target: 'stress', direction: 'down', window: 'nextBlock' })
    // Too little record to expect anything yet: said as nothing, never made up.
    expect(r.prediction).toEqual({ day: DAY, block: 'evening', expected: null, basis: 'slotMean' })
  })

  it('saves the prediction before any outcome, from the slot’s own recent answers, and none for Nothing’s intent', () => {
    const past = ['2026-09-15', '2026-09-16', '2026-09-17'].map((d) => checkin(d, 'evening', { mood: 4 }))
    const r = drawRecordOf({ excluded: new Map(), candidates: [NOTHING], belief: () => ({ mean: 0, sd: 1, n: 0 }), target: 'mood', window: null, context: drawContextOf(null, past, DAY), checkins: past, day: DAY, block: 'afternoon', engine: REPAIR_ENGINE })
    expect(r.intended).toBeNull()
    expect(r.prediction).toEqual({ day: DAY, block: 'evening', expected: 4, basis: 'slotMean' })
  })

  it('takes the day’s context as it stands at the draw: the week’s shape, her, a trip, unwell, last night', () => {
    const ctx = { day: DAY, weekday: 5, withHer: true, studyNight: false, churchDay: false, atOffice: true, pickupTime: '17:30', soloUntil: '20:00', changed: true, createdAt: '', unwell: true } as const
    const short = [checkin(DAY, 'morning', { sleepHours: 2 })]
    expect(drawContextOf(ctx, short, DAY)).toEqual({ weekday: 5, weekend: false, withHer: true, office: true, church: false, away: false, unwell: true, shortSleep: true })
    expect(drawContextOf(ctx, [checkin(DAY, 'morning', { sleepHours: 4 })], DAY).shortSleep).toBe(false)
    expect(drawContextOf(undefined, [], '2026-09-19')).toMatchObject({ weekday: 6, weekend: true, shortSleep: null })
  })

  it('names every reason an answer can have, never folding one into another', () => {
    expect([outcomeReasonOf('done', null), outcomeReasonOf('partly', null), outcomeReasonOf('no', 'noTime'), outcomeReasonOf('no', 'didntWant'), outcomeReasonOf('no', null), outcomeReasonOf(null, null)]).toEqual(['done', 'partly', 'noTime', 'didntWant', 'no', 'unanswered'])
  })
})

describe('the foundations, as the phone records them', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureDayContext(DAY, await getSettings())
  })
  afterEach(() => vi.unstubAllGlobals())

  // Drawn by the learning engine, the only one since the old engine was retired (2026-10-20): the record of what the draw
  // knew, naming the engine that drew.
  it('keeps what each draw knew on the offer, the day marked unwell among it', async () => {
    await setDayContext(DAY, { unwell: true })
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const offer = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    const stored = (await db.offers.get(offer.id as number)) as Offer
    expect(stored.draw?.engine).toBe(REPAIR_ENGINE)
    expect(Object.keys(stored.draw?.beliefs ?? {}).sort()).toEqual([...stored.candidates].sort())
    expect(Object.values(stored.draw?.excluded ?? {}).flat().length).toBeGreaterThan(0)
    for (const id of stored.candidates) expect(Object.values(stored.draw?.excluded ?? {}).flat()).not.toContain(id)
    expect(stored.draw?.context).toMatchObject({ unwell: true, weekday: 5 })
    if (stored.moveId === NOTHING) expect(stored.draw?.intended).toBeNull()
    else expect(stored.draw?.intended?.target).toBe(stored.target)
    expect(stored.draw?.prediction).toMatchObject({ day: DAY, basis: 'slotMean' })
  })

  it('keeps what the pickup draw knew on its offer too: energy, read at the next check-in', async () => {
    await updateSettings((st) => ({ ...st, week: { ...st.week, pickupTime: '17:00' } }))
    await db.days.clear()
    await ensureDayContext(DAY, await getSettings())
    const offer = (await ensurePickupOffer(new Date(2026, 8, 18, 16, 0), () => 0.3)) as Offer
    const stored = (await db.offers.get(offer.id as number)) as Offer
    expect(stored.kind).toBe('pickup')
    expect(stored.draw?.engine).toBe(REPAIR_ENGINE)
    expect(Object.keys(stored.draw?.beliefs ?? {}).sort()).toEqual([...stored.candidates].sort())
    if (stored.moveId === NOTHING) expect(stored.draw?.intended).toBeNull()
    else expect(stored.draw?.intended).toEqual({ target: 'energy', direction: 'up', window: 'nextBlock' })
    expect(stored.draw?.context).toMatchObject({ withHer: true, weekday: 5 })
  })

  it('records a move seen on Now on its own offer, once, and never on another drawn under the same id', async () => {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const offer = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    await markOfferSeen(`${offer.id}:1999-01-01T00:00:00.000Z`, new Date(2026, 8, 18, 14, 1))
    expect((await db.offers.get(offer.id as number))?.seenAt).toBeUndefined()
    await markOfferSeen(`${offer.id}:${offer.at}`, new Date(2026, 8, 18, 14, 2))
    await markOfferSeen(`${offer.id}:${offer.at}`, new Date(2026, 8, 18, 14, 9))
    expect((await db.offers.get(offer.id as number))?.seenAt).toBe(new Date(2026, 8, 18, 14, 2).toISOString())
  })

  it('keeps each answer’s reason, and whether its card had been seen by then', async () => {
    for (const id of asked) await saveAnswer({ day: DAY, block: 'afternoon' }, asked, id, 3, 500)
    const offer = (await ensureOffer(DAY, 'afternoon', () => 0.3)) as Offer
    await recordOutcome(offer, 'no', 'noTime', null, { day: DAY, block: 'evening' })
    expect((await db.outcomes.toArray())[0]).toMatchObject({ outcome: 'no', why: 'noTime', reason: 'noTime', seen: false })
    await db.outcomes.clear()
    await markOfferSeen(`${offer.id}:${offer.at}`)
    await recordOutcome(offer, null, null, null, { day: DAY, block: 'evening' })
    expect((await db.outcomes.toArray())[0]).toMatchObject({ outcome: null, reason: 'unanswered', seen: true })
  })

  it('keeps the reason of a session marked done from its card too', async () => {
    await addAim('practice', 'box-breathing')
    const aim = (await activeAims()).find((a) => a.kind === 'practice') as Aim
    const session = await resumeAim(aim, stepFor(aim, [], []), 'step', new Date(2026, 8, 18, 9, 0))
    expect(await recordDoneNow(session, new Date(2026, 8, 18, 9, 20))).toBe(true)
    expect((await db.outcomes.toArray())[0]).toMatchObject({ outcome: 'done', reason: 'done', seen: false })
  })
})
