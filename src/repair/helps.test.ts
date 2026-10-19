import { describe, expect, it } from 'vitest'
import { addDays } from '../blocks'
import { helpsOf, nearestOf, nearnessOf, repairEvidenceFrom, type HelpsShown, type NearShown } from './evidence'
import { START, walkRecord } from './fixtures'

// "What helps you" (stage R4, part 2), the agreed item word for word: "Evidence opens with "what helps you": per reading,
// moves ranked by the owner's pooled record with research beside them, and the tests nearest finishing with a date." The
// date is the day a test began; a projected finish would promise a speed the stress test shows cannot be kept.

const h = (over: Partial<HelpsShown>): HelpsShown => ({ key: `${over.moveId ?? 'a'}|${over.target ?? 'stress'}|nextBlock`, moveId: 'a', target: 'stress', belief: 0.3, research: 0.2, level: 'none', direction: null, ...over })
const n = (over: Partial<NearShown>): NearShown => ({ key: over.key ?? 'a|stress|nextBlock', moveId: 'a', target: 'stress', window: 'nextBlock', began: '2026-09-01', nearness: 0.5, level: 'none', direction: null, ...over })

describe('what helps you', () => {
  it('per reading, the moves whose pooled belief says they help, best first, three at most', () => {
    const all = [h({ moveId: 'a', belief: 0.2 }), h({ moveId: 'b', belief: 0.9 }), h({ moveId: 'c', belief: 0.5 }), h({ moveId: 'd', belief: 0.4 }), h({ moveId: 'e', belief: -0.3 }), h({ moveId: 'f', target: 'mood', belief: 0.1 })]
    const groups = helpsOf(all, ['stress', 'mood', 'focus'])
    expect(groups.map((g) => g.target)).toEqual(['stress', 'mood'])
    expect(groups[0].moves.map((m) => m.moveId)).toEqual(['b', 'c', 'd'])
    expect(groups[1].moves.map((m) => m.moveId)).toEqual(['f'])
  })

  it('a move whose belief does not say it helps is never listed', () => {
    expect(helpsOf([h({ belief: 0 }), h({ moveId: 'b', belief: -0.2 })], ['stress'])).toEqual([])
  })
})

describe('the tests nearest finishing', () => {
  it('nearness reaches one as a call does: helps or hurts once the estimate passes the half-width, little difference once the margin covers both', () => {
    expect(nearnessOf(1, 1, 0.25)).toBeCloseTo(1, 9)
    expect(nearnessOf(-0.5, 1, 0.25)).toBeCloseTo(0.5, 9)
    expect(nearnessOf(0.05, 0.2, 0.25)).toBeCloseTo(1, 9)
    expect(nearnessOf(0.1, 0, 0.25)).toBe(0)
  })

  it('nearest first, three at most, an established call never among them', () => {
    const all = [n({ key: 'a', nearness: 0.2 }), n({ key: 'b', nearness: 0.9 }), n({ key: 'c', nearness: 1.4, level: 'established', direction: 'helps' }), n({ key: 'd', nearness: 0.6 }), n({ key: 'e', nearness: 0.7 })]
    expect(nearestOf(all).map((x) => x.key)).toEqual(['b', 'e', 'd'])
  })
})

describe('read from the record', () => {
  it('the walk, whose record says it helps stress, is listed under Stress with research beside it, and its test with the day it began', () => {
    const ev = repairEvidenceFrom(walkRecord(14, true), addDays(START, 14))
    const stress = ev.helps.find((g) => g.target === 'stress')
    const walk = stress?.moves.find((m) => m.moveId === 'walk-ten')
    expect(walk?.belief).toBeGreaterThan(0)
    expect(walk?.research).toBe(0.4)
    const near = ev.nearest.find((x) => x.key === 'walk-ten|stress|nextBlock')
    // Its first randomized decision: the first check-in of the record with the walk among the draw's candidates.
    expect(near?.began).toBe(START)
    expect(near?.nearness).toBeGreaterThan(0)
  })
})
