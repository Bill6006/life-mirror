import { describe, expect, it } from 'vitest'
import type { Intention, Offer } from './db'
import { chipOrder, keptByCue, learnedDelay, MOMENT_MIN_STARTS, momentFor, PICKUP_ALLOWANCE_MIN, planMoment } from './planMoment'

// Timing (stage 3, group 2): a plan's reminder comes at the moment its commitment actually happens,
// learned from the owner's own starts after the same cue, never mid-pickup; the Plan when chips come
// in the order the record keeps them.

const TODAY = '2026-09-20'
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`
/** A plan at a cue on a day, started at a local time that day or not at all. */
function planned(id: number, d: number, cue: Intention['cue'], time: string, startedAt: string | null, aimId = 1): { plan: Intention; offer: Offer | null } {
  const [h, m] = (startedAt ?? '00:00').split(':').map(Number)
  const offer = startedAt === null ? null : ({ id: 100 + id, day: day(d), at: new Date(2026, 8, d, h, m).toISOString() } as unknown as Offer)
  return { plan: { id, aimId, day: day(d), cue, time, setAt: new Date(2026, 8, d, 9, 0).toISOString(), offerId: offer ? (offer.id as number) : null }, offer }
}
function record(...rows: ReturnType<typeof planned>[]): { intentions: Intention[]; offers: Offer[] } {
  return { intentions: rows.map((r) => r.plan), offers: rows.map((r) => r.offer).filter((o): o is Offer => o !== null) }
}

describe('the moment a commitment actually happens', () => {
  it('is the median delay from the cue to the starts its plans led to, once there are three', () => {
    const two = record(planned(1, 10, 'afterPickup', '17:00', '17:40'), planned(2, 11, 'afterPickup', '17:00', '17:50'))
    expect(learnedDelay(two.intentions, two.offers, 'afterPickup', 1, TODAY)).toBeNull()
    const three = record(planned(1, 10, 'afterPickup', '17:00', '17:40'), planned(2, 11, 'afterPickup', '17:00', '17:50'), planned(3, 12, 'afterPickup', '17:30', '18:30'))
    expect(MOMENT_MIN_STARTS).toBe(3)
    expect(learnedDelay(three.intentions, three.offers, 'afterPickup', 1, TODAY)).toBe(50)
  })

  it('reads only that cue, starts on the plan’s own day, plans not started, and the last 60 days', () => {
    const r = record(
      planned(1, 10, 'afterPickup', '17:00', '17:40'),
      planned(2, 11, 'afterBedtime', '20:00', '20:10'),
      planned(3, 12, 'afterPickup', '17:00', null),
      planned(4, 13, 'afterPickup', '17:00', '17:20'),
    )
    // A start on another day than its plan's is no moment of that plan, even one that came later in the day than its cue.
    r.offers.push({ id: 900, day: day(15), at: new Date(2026, 8, 15, 18, 0).toISOString() } as unknown as Offer)
    r.intentions.push({ id: 9, aimId: 1, day: day(14), cue: 'afterPickup', time: '17:00', setAt: new Date(2026, 8, 14, 9).toISOString(), offerId: 900 })
    expect(learnedDelay(r.intentions, r.offers, 'afterPickup', 1, TODAY)).toBeNull()
    // A plan older than the window counts for nothing.
    const old = record(planned(1, 10, 'afterPickup', '17:00', '17:40'), planned(2, 11, 'afterPickup', '17:00', '17:50'), planned(3, 12, 'afterPickup', '17:00', '17:45'))
    expect(learnedDelay(old.intentions, old.offers, 'afterPickup', 1, '2026-11-20')).toBeNull()
  })

  it('learns per commitment first, then from every commitment together', () => {
    const r = record(planned(1, 10, 'afterPickup', '17:00', '18:00', 2), planned(2, 11, 'afterPickup', '17:00', '18:00', 3), planned(3, 12, 'afterPickup', '17:00', '18:00', 4))
    expect(learnedDelay(r.intentions, r.offers, 'afterPickup', 1, TODAY)).toBeNull()
    expect(learnedDelay(r.intentions, r.offers, 'afterPickup', null, TODAY)).toBe(60)
    expect(momentFor(r.intentions, r.offers, 1, 'afterPickup', '17:00', '17:00', new Date(2026, 8, 20, 9))).toBe('18:00')
  })
})

describe('when the reminder comes', () => {
  it('after pickup with nothing learned: the allowance for getting home, never the pickup time itself', () => {
    expect(PICKUP_ALLOWANCE_MIN).toBe(45)
    expect(planMoment('afterPickup', '17:00', '17:00', null)).toBe('17:45')
  })

  it('with a moment learned: the cue’s time plus it, but never inside the pickup', () => {
    expect(planMoment('afterPickup', '17:00', '17:00', 70)).toBe('18:10')
    expect(planMoment('afterPickup', '17:00', '17:00', 20)).toBe('17:45')
    // Another cue whose moment falls inside the day's pickup waits for its end.
    expect(planMoment('nextCheckIn', '17:10', '17:00', 0)).toBe('17:45')
    expect(planMoment('afterBedtime', '20:00', '17:00', 15)).toBe('20:15')
  })

  it('never before the cue’s own time, and never past the day', () => {
    expect(planMoment('afterBedtime', '20:00', null, null)).toBe('20:00')
    expect(planMoment('afterBedtime', '23:30', null, 90)).toBe('23:59')
  })
})

describe('the Plan when chips', () => {
  const cues = [
    { cue: 'afterPickup' as const, time: '17:00' },
    { cue: 'afterBedtime' as const, time: '20:00' },
    { cue: 'nextCheckIn' as const, time: '19:00' },
  ]

  it('come in the order the record keeps them, ties in the cues’ own order', () => {
    expect(chipOrder(cues, []).map((c) => c.cue)).toEqual(['afterPickup', 'afterBedtime', 'nextCheckIn'])
    expect(chipOrder(cues, [{ cue: 'nextCheckIn', n: 4, started: 3 }, { cue: 'afterPickup', n: 5, started: 1 }]).map((c) => c.cue)).toEqual(['nextCheckIn', 'afterPickup', 'afterBedtime'])
  })

  it('count the last 60 days, the latest plan of each day alone', () => {
    const r = record(planned(1, 10, 'nextCheckIn', '19:00', '19:20'), planned(2, 11, 'afterPickup', '17:00', null), planned(3, 12, 'nextCheckIn', '19:00', '19:30'))
    // A plan replaced the same day counts for nothing.
    r.intentions.push({ id: 4, aimId: 1, day: day(12), cue: 'afterBedtime', time: '20:00', setAt: new Date(2026, 8, 12, 8).toISOString(), offerId: null })
    expect(keptByCue(r.intentions, 1, TODAY)).toEqual([
      { cue: 'afterPickup', n: 1, started: 0 },
      { cue: 'nextCheckIn', n: 2, started: 2 },
    ])
    expect(keptByCue(r.intentions, 1, '2026-12-01')).toEqual([])
  })
})
