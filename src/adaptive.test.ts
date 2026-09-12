import { describe, expect, it } from 'vitest'
import { adaptiveDiff, armEstimate, normalTail, propensities, zFor, type Opportunity } from './adaptive'
import { seeded } from './bandit'
import type { Card } from './db'
import type { Observation } from './learning'
import { declarationsDue, evaluateCards } from './tiers'

const opp = (arm: Opportunity['arm'], effect: number, eMove: number, eAlternative: number): Opportunity => ({ arm, effect, weight: 1, eMove, eAlternative })

describe('the adaptive estimator', () => {
  it('records every candidate’s probability of being offered, summing to one, the coin flip’s share included', () => {
    const p = propensities(
      [
        { id: 'a', effort: 'low' },
        { id: 'b', effort: 'high' },
      ],
      (id) => (id === 'a' ? { mean: 1, sd: 0.1, n: 5 } : { mean: 0, sd: 0.1, n: 5 }),
      seeded(3),
    )
    expect(p.a + p.b).toBeCloseTo(1, 10)
    expect(p.a).toBeGreaterThan(0.85)
    expect(p.b).toBeGreaterThanOrEqual(0.1)
    expect(propensities([], () => ({ mean: 0, sd: 1, n: 0 }), seeded(1))).toEqual({})
  })

  it('reduces to the plain mean when every opportunity had the same probability', () => {
    const opps = [opp('move', 2, 0.5, 0.5), opp('move', 1, 0.5, 0.5), opp('alternative', 0, 0.5, 0.5), opp('alternative', 1, 0.5, 0.5)]
    const m = armEstimate(opps, 'move')
    const a = armEstimate(opps, 'alternative')
    // Each score is Y over e where the arm was taken and zero elsewhere, weighted evenly: the mean of Y over all four, doubled by 1 over e.
    expect(m.mean).toBeCloseTo((2 + 1) / 0.5 / 4, 10)
    expect(a.mean).toBeCloseTo((0 + 1) / 0.5 / 4, 10)
    expect(m.n).toBe(2)
    const d = adaptiveDiff(opps, 0.95)
    expect(d.diff).toBeCloseTo(m.mean - a.mean, 10)
    expect(d.lo).toBeLessThan(d.diff)
    expect(d.hi).toBeGreaterThan(d.diff)
    expect(d.nMove).toBe(2)
    expect(d.nAlternative).toBe(2)
  })

  it('weights a rarely offered arm up by its probability, so a bandit that favoured one arm still yields an honest comparison', () => {
    const favoured = Array.from({ length: 12 }, () => opp('move', 1, 0.8, 0.2))
    const rare = Array.from({ length: 3 }, () => opp('alternative', 1, 0.8, 0.2))
    const d = adaptiveDiff([...favoured, ...rare], 0.95)
    // Both arms read one step; the estimate says so, whatever the allocation.
    expect(d.diff).toBeCloseTo(0, 5)
  })

  it('uses a normal tail and quantile that agree', () => {
    expect(normalTail(1.96)).toBeCloseTo(0.025, 3)
    expect(zFor(0.95)).toBeCloseTo(1.96, 2)
    expect(zFor(0.99)).toBeCloseTo(2.576, 2)
  })
})

const card = (id: number): Card => ({ id, createdAt: '2026-08-01T12:00:00.000Z', situationKey: 'afternoon:mood', block: 'afternoon', target: 'mood', moveId: 'walk-ten', alternativeId: 'nap-ten', window: 'nextBlock', worthwhile: 1 })
let seq = 0
function ob(moveId: string, effect: number, day: string, propensities: Record<string, number> | null, coinFlip = false): Observation {
  return { offerId: ++seq, moveId, situationKey: 'afternoon:mood', target: 'mood', window: 'nextBlock', day, block: 'afternoon', arm: 'done', effect, weight: 1, coinFlip, spill: {}, energy: null, propensity: propensities ? (propensities[moveId] ?? null) : null, propensities }
}

describe('the tiers on the adaptive estimator', () => {
  const p = { 'walk-ten': 0.6, 'nap-ten': 0.3, nothing: 0.1 }

  it('names the estimator on every claim: the adaptive weights over all the data once eight per arm carry their probabilities, else the coin-flip slice', () => {
    const days = (i: number) => `2026-08-${String(2 + i).padStart(2, '0')}`
    const walks = Array.from({ length: 10 }, (_, i) => ob('walk-ten', 2.5 + (i % 3) * 0.1, days(i), p))
    const naps = Array.from({ length: 9 }, (_, i) => ob('nap-ten', (i % 3) * 0.1 - 0.1, days(i), p))
    const stats = evaluateCards([card(1)], [...walks, ...naps], [])[0]
    expect(stats.estimator).toBe('adaptive')
    expect(stats.n.done).toBe(10)
    expect(stats.n.alternative).toBe(9)
    expect(stats.tier).toBe('promising')
    expect(stats.interval?.lo).toBeGreaterThan(0)
    // Without recorded probabilities, only the coin-flip slice can claim.
    const sliceOnly = [...walks.map((o) => ({ ...o, propensities: null, propensity: null, coinFlip: true })), ...naps.map((o) => ({ ...o, propensities: null, propensity: null, coinFlip: true }))]
    const s2 = evaluateCards([card(1)], sliceOnly, [])[0]
    expect(s2.estimator).toBe('coinFlip')
    expect(s2.tier).toBe('promising')
    // The declaration carries the estimator that made it.
    const due = declarationsDue([card(1)], [stats], [], '2026-08-20')
    expect(due[0]?.estimator).toBe('adaptive')
  })

  it('keeps the coin-flip slice running beside the adaptive claim', () => {
    const days = (i: number) => `2026-08-${String(2 + i).padStart(2, '0')}`
    const walks = Array.from({ length: 10 }, (_, i) => ob('walk-ten', 1.5, days(i), p, true))
    const naps = Array.from({ length: 10 }, (_, i) => ob('nap-ten', 0, days(i), p, true))
    const stats = evaluateCards([card(1)], [...walks, ...naps], [])[0]
    expect(stats.estimator).toBe('adaptive')
    expect(stats.slice).not.toBeNull()
    expect(stats.slice?.diff).toBeCloseTo(1.5, 5)
  })
})
