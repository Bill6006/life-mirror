import { describe, expect, it } from 'vitest'
import { associationFor, coolingOffDuration, likeForLike, privateAssociations, whatBringsYouBack, type DayPoint } from './associations'
import { hasMove } from './catalogue'
import type { CheckIn, Offer, Outcome } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], p: Position, extras?: CheckIn['extras']): CheckIn => ({ day, block, answers: allAt(blockReadings(block), p), startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000, extras })
const point = (day: string, band: DayPoint['band'], event: boolean, outcome: number | null): DayPoint => ({ day, band, event, outcome })

describe('like for like', () => {
  it('compares within each evening band present on both sides, headroom accounted for', () => {
    const points = [
      point('2026-09-01', 'gettingBy', true, 40),
      point('2026-09-02', 'gettingBy', false, 50),
      point('2026-09-03', 'solid', true, 60),
      point('2026-09-04', 'solid', false, 70),
      point('2026-09-05', 'firing', false, 90),
    ]
    const a = likeForLike(points)
    expect(a.times).toBe(2)
    expect(a.withEvent).toEqual({ mean: 50, n: 2 })
    expect(a.without).toEqual({ mean: 70, n: 3 })
    // Within bands the event mornings read ten lower; the unmatched firing evening does not count.
    expect(a.diff).toBe(-10)
    expect(a.bands).toBe(2)
  })

  it('has nothing to set against when no band appears on both sides', () => {
    const a = likeForLike([point('2026-09-01', 'empty', true, 30), point('2026-09-02', 'firing', false, 90)])
    expect(a.diff).toBeNull()
    expect(a.bands).toBe(0)
    expect(a.withEvent.mean).toBe(30)
  })

  it('reads events from the evenings before today and the mornings after them', () => {
    const all = [ci('2026-09-01', 'evening', 3, { caffeine: true }), ci('2026-09-02', 'morning', 4), ci('2026-09-02', 'evening', 3), ci('2026-09-03', 'morning', 2), ci('2026-09-11', 'evening', 3, { caffeine: true })]
    const a = associationFor(all, '2026-09-11', (c) => Boolean(c.extras?.caffeine))
    expect(a.times).toBe(1)
    expect(a.withEvent).toEqual({ mean: 50, n: 1 })
    expect(a.without).toEqual({ mean: 50, n: 1 })
    expect(a.diff).toBe(0)
  })
})

describe('private items in selection', () => {
  const items = [{ id: 7, name: 'Item one' }]
  const all = [ci('2026-09-01', 'evening', 3, { private: { '7': true } }), ci('2026-09-02', 'morning', 2), ci('2026-09-02', 'evening', 3), ci('2026-09-03', 'morning', 4)]

  it('computes nothing at all while the toggle is off', () => {
    expect(privateAssociations(false, items, all, '2026-09-11')).toEqual([])
  })

  it('names an alternative with every association when on, never "don’t"', () => {
    const out = privateAssociations(true, items, all, '2026-09-11')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Item one')
    expect(out[0].association.times).toBe(1)
    expect(hasMove(out[0].alternativeId)).toBe(true)
    expect(out[0].alternativeId).not.toContain('dont')
  })
})

describe('cooling off and what brings you back', () => {
  it('says nothing about cooling off before any event was marked', () => {
    expect(coolingOffDuration([ci('2026-09-01', 'evening', 3)], '2026-09-11')).toBeNull()
  })

  it('counts the moves done in the day before a Resume that followed three days away', () => {
    const step = (id: number, day: string): Offer => ({ id, kind: 'step', day, block: 'evening', at: `${day}T20:00:00.000Z`, situationKey: 'aim:certification', target: 'focus', stance: '', band: '', reading: 0, moveId: 'rung:1:1', cardId: null, candidates: [], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null })
    const move = (id: number, day: string, moveId: string): Offer => ({ ...step(id, day), kind: 'block', situationKey: 'afternoon:mood', moveId, at: `${day}T14:00:00.000Z` })
    const done = (offerId: number): Outcome => ({ offerId, moveId: '', day: '', block: 'evening', at: '', outcome: 'done', why: null, passiveOutcome: null })
    const offers = [step(1, '2026-09-01'), move(2, '2026-09-04', 'walk-ten'), move(3, '2026-09-05', 'cyclic-sigh'), step(4, '2026-09-05'), move(5, '2026-09-06', 'walk-ten'), step(6, '2026-09-07')]
    const outcomes = [done(2), done(3), done(5)]
    // The resume on 09-05 followed four days away: the walk on 09-04 and the sigh on 09-05 (before it) count; the resume on 09-07 did not follow a gap.
    expect(whatBringsYouBack(offers, outcomes)).toEqual([
      { moveId: 'walk-ten', n: 1 },
      { moveId: 'cyclic-sigh', n: 1 },
    ])
    expect(whatBringsYouBack(offers, [])).toEqual([])
  })
})
