import { describe, expect, it } from 'vitest'
import { addDays } from '../blocks'
import { NOTHING } from '../catalogue'
import type { Offer } from '../db'
import { asideFits } from './engine'
import { START, walkRecord } from './fixtures'
import { repairAsideFrom } from './flow'

// A move drawn outside the comparisons (the owner's requirement of 2026-10-20: a skip's replacement and the pickup-time
// move on the new engine) keeps the engine's own day rules: one move with a day's window a day, never one over several
// days, which only a check-in's draw starts; and each such offer is noted for the rest of the day.

const DAY = addDays(START, 13)

function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a * 16807) % 2147483647
    return a / 2147483647
  }
}

/** A move offered outside the comparisons that day: a replacement or a pickup, nothing extra never among its candidates. */
function aside(moveId: string, id: number, day = DAY): Offer {
  return { id, kind: 'block', day, block: 'afternoon', at: 'x', situationKey: 'mood|low', target: 'mood', stance: '', band: 'low', reading: 2, moveId, cardId: null, candidates: [moveId, 'walk-ten'], coinFlip: false, passiveId: null, whyNot: null, propensity: 0.5, propensities: { [moveId]: 0.5, 'walk-ten': 0.5 }, skippedAt: null, closedAt: null } as Offer
}

describe('a move drawn outside the comparisons', () => {
  it('fits a move for the next block always, one with a day’s window only while the day has none, and never one over several days', () => {
    expect(asideFits('next', new Set())).toBe(true)
    expect(asideFits('next', new Set(['day', 'multi']))).toBe(true)
    expect(asideFits('day', new Set())).toBe(true)
    expect(asideFits('day', new Set(['next', 'multi']))).toBe(true)
    expect(asideFits('day', new Set(['day']))).toBe(false)
    expect(asideFits('multi', new Set())).toBe(false)
  })

  it('draws among the moves it is given that fit, every chance kept, and never one over several days', () => {
    // For mood: a walk is for the next block, cooking for the evening (a day's window), a spaced review over seven days.
    const drawn = repairAsideFrom(walkRecord(14), DAY, 'mood', ['walk-ten', 'cook-tonight', 'spaced-review'], seeded(7))
    expect([...(drawn?.candidates ?? [])].sort()).toEqual(['cook-tonight', 'walk-ten'])
    expect(drawn?.candidates).not.toContain(NOTHING)
    expect(Object.values(drawn?.chances ?? {}).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  })

  it('leaves out a day’s-window move once one was offered aside that day, noted for the rest of the day, and only that day', () => {
    const r = walkRecord(14)
    const noted = { ...r, offers: [...r.offers, aside('cook-tonight', 9001)] }
    expect(repairAsideFrom(noted, DAY, 'mood', ['walk-ten', 'one-load-done'], seeded(7))?.candidates).toEqual(['walk-ten'])
    expect(repairAsideFrom(noted, DAY, 'mood', ['one-load-done'], seeded(7))).toBeNull()
    const dayBefore = { ...r, offers: [...r.offers, aside('cook-tonight', 9001, addDays(DAY, -1))] }
    expect([...(repairAsideFrom(dayBefore, DAY, 'mood', ['walk-ten', 'one-load-done'], seeded(7))?.candidates ?? [])].sort()).toEqual(['one-load-done', 'walk-ten'])
  })

  it('leaves out a day’s-window move once a check-in’s draw offered one that day', () => {
    const r = walkRecord(14)
    const drewOne = { ...r, offers: r.offers.map((o) => (o.day === DAY && o.block === 'morning' ? { ...o, moveId: 'cook-tonight', candidates: ['cook-tonight', NOTHING], propensities: { 'cook-tonight': 0.5, [NOTHING]: 0.5 } } : o)) }
    expect(repairAsideFrom(drewOne, DAY, 'mood', ['walk-ten', 'one-load-done'], seeded(7))?.candidates).toEqual(['walk-ten'])
  })
})
