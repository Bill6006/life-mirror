import { describe, expect, it } from 'vitest'
import type { Card, CheckIn, Declaration } from './db'
import type { Observation } from './learning'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { declarationsDue, evaluateCards, evaluateWeightCard, hasItsEight, holmLevels, proposeWeights, weightPairs } from './tiers'

// Fixture records reproduce each tier exactly: the draw is seeded, so the intervals are the
// same every run. Confirmatory claims rest on the coin-flip slice.

const card = (id: number, moveId = 'walk-ten', alternativeId = 'nap-ten', situationKey = 'afternoon:mood'): Card => ({
  id,
  createdAt: '2026-08-01T12:00:00.000Z',
  situationKey,
  block: 'afternoon',
  target: 'mood',
  moveId,
  alternativeId,
  window: 'nextBlock',
  worthwhile: 1,
})

let seq = 0
function obs(moveId: string, effects: readonly number[], opts: { day?: (i: number) => string; coinFlip?: boolean; arm?: Observation['arm']; situationKey?: string; propensities?: Record<string, number> } = {}): Observation[] {
  return effects.map((effect, i) => ({
    offerId: ++seq,
    moveId,
    situationKey: opts.situationKey ?? 'afternoon:mood',
    target: 'mood',
    window: 'nextBlock',
    day: opts.day ? opts.day(i) : `2026-08-${String(2 + (i % 27)).padStart(2, '0')}`,
    block: 'afternoon',
    arm: opts.arm ?? 'done',
    effect,
    weight: 1,
    coinFlip: opts.coinFlip ?? true,
    spill: {},
    energy: null,
    propensity: opts.propensities ? opts.propensities[moveId] ?? null : null,
    propensities: opts.propensities ?? null,
  }))
}

const helpful = [1.4, 1.6, 1.5, 1.7, 1.3, 1.5, 1.6, 1.4, 1.5, 1.5]
const flat = [0.1, -0.1, 0, 0.2, -0.2, 0, 0.1, -0.1, 0, 0]
const harmful = helpful.map((v) => -v)

describe('the tiers', () => {
  it('says Little evidence under eight done opportunities on either arm, counting only the coin-flip slice', () => {
    const c = card(1)
    const few = [...obs('walk-ten', helpful.slice(0, 7)), ...obs('nap-ten', flat)]
    expect(evaluateCards([c], few, [])[0]).toMatchObject({ tier: 'little', n: { done: 7, alternative: 10 } })
    const notFlipped = [...obs('walk-ten', helpful, { coinFlip: false }), ...obs('nap-ten', flat)]
    const s = evaluateCards([c], notFlipped, [])[0]
    expect(s.tier).toBe('little')
    expect(s.n.done).toBe(0)
    expect(s.n.doneAll).toBe(10)
  })

  it('reproduces Unclear, Promising and Unhelpful here exactly from fixture arms', () => {
    const c = card(1)
    const unclear = evaluateCards([c], [...obs('walk-ten', flat), ...obs('nap-ten', flat)], [])[0]
    expect(unclear.tier).toBe('unclear')
    expect(unclear.interval?.lo).toBeLessThanOrEqual(0)
    expect(unclear.interval?.hi).toBeGreaterThanOrEqual(0)
    const promising = evaluateCards([c], [...obs('walk-ten', helpful), ...obs('nap-ten', flat)], [])[0]
    expect(promising.tier).toBe('promising')
    expect(promising.interval?.lo).toBeGreaterThan(1)
    expect(promising.declared).toBeNull()
    const unhelpful = evaluateCards([c], [...obs('walk-ten', harmful), ...obs('nap-ten', flat)], [])[0]
    expect(unhelpful.tier).toBe('unhelpful')
    expect(unhelpful.interval?.hi).toBeLessThan(0)
    // The same fixture, the same numbers, every time.
    const again = evaluateCards([c], [...obs('walk-ten', helpful), ...obs('nap-ten', flat)], [])[0]
    expect(again.interval).toEqual(promising.interval)
  })

  it('declares a card whose interval clears the worthwhile change, dated, and holds up only on replication after it', () => {
    const c = card(1)
    const before = [...obs('walk-ten', helpful, { day: (i) => `2026-08-${String(2 + i).padStart(2, '0')}` }), ...obs('nap-ten', flat, { day: (i) => `2026-08-${String(2 + i).padStart(2, '0')}` })]
    const stats = evaluateCards([c], before, [])
    const due = declarationsDue([c], stats, [], '2026-08-15')
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ cardId: 1, at: '2026-08-15', nDone: 10, nAlternative: 10 })
    const declarations: Declaration[] = due
    // Declared, not yet replicated: still Promising.
    expect(evaluateCards([c], before, declarations)[0]).toMatchObject({ tier: 'promising', replication: { done: 0, alternative: 0, holds: false } })
    expect(declarationsDue([c], evaluateCards([c], before, declarations), declarations, '2026-08-16')).toHaveLength(0)
    // Six more per arm after the declaration, the same way: Holds up.
    const after = [...before, ...obs('walk-ten', helpful.slice(0, 6), { day: (i) => `2026-08-${String(20 + i).padStart(2, '0')}` }), ...obs('nap-ten', flat.slice(0, 6), { day: (i) => `2026-08-${String(20 + i).padStart(2, '0')}` })]
    const held = evaluateCards([c], after, declarations)[0]
    expect(held.tier).toBe('holdsUp')
    expect(held.replication?.holds).toBe(true)
    // Data collected before the declaration cannot change it: the frozen interval stays, and so does the tier.
    const contradictedEarlier = [...after, ...obs('walk-ten', harmful, { day: (i) => `2026-07-${String(2 + i).padStart(2, '0')}` })]
    const still = evaluateCards([c], contradictedEarlier, declarations)[0]
    expect(still.tier).toBe('holdsUp')
    expect(still.interval).toEqual(held.interval)
    // Data collected after can: a contradicting replication leaves it Promising.
    const contradictedLater = [...before, ...obs('walk-ten', harmful.slice(0, 6), { day: (i) => `2026-08-${String(20 + i).padStart(2, '0')}` }), ...obs('nap-ten', flat.slice(0, 6), { day: (i) => `2026-08-${String(20 + i).padStart(2, '0')}` })]
    expect(evaluateCards([c], contradictedLater, declarations)[0].tier).toBe('promising')
  })

  it('tightens every interval across the cards active that day with Holm’s step-down', () => {
    expect(holmLevels([0.01, 0.04, 0.2])).toEqual([1 - 0.05 / 3, 1 - 0.05 / 2, 1 - 0.05 / 1])
    expect(holmLevels([0.2, 0.01])).toEqual([1 - 0.05 / 1, 1 - 0.05 / 2])
    const cards = [card(1), card(2, 'cyclic-sigh', 'nap-ten', 'evening:stress')]
    const both = [...obs('walk-ten', helpful), ...obs('nap-ten', flat), ...obs('cyclic-sigh', helpful, { situationKey: 'evening:stress' }), ...obs('nap-ten', flat, { situationKey: 'evening:stress' })]
    const stats = evaluateCards(cards, both, [])
    expect(stats.map((s) => s.interval?.level as number).sort((a, b) => a - b)).toEqual([1 - 0.05 / 1, 1 - 0.05 / 2])
  })

  it('keeps partly as its own arm, reported only from eight', () => {
    const c = card(1)
    const withPartly = [...obs('walk-ten', helpful), ...obs('nap-ten', flat), ...obs('walk-ten', [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], { arm: 'partly' })]
    const s = evaluateCards([c], withPartly, [])[0]
    expect(s.n.partly).toBe(8)
    expect(s.partlyMean).toBe(0.5)
    expect(evaluateCards([c], withPartly.slice(0, 25), [])[0].partlyMean).toBeNull()
  })
})

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))
const ci = (day: string, block: CheckIn['block'], answers: Answers): CheckIn => ({ day, block, answers, startedAt: '', completedAt: 'x', updatedAt: '', activeMs: 30_000 })

describe('weight cards', () => {
  it('needs four weeks of full days before proposing weights, and eight pairs before a tier', () => {
    const days = Array.from({ length: 10 }, (_, i) => `2026-08-${String(1 + i).padStart(2, '0')}`)
    const short = days.flatMap((d) => [ci(d, 'morning', allAt(blockReadings('morning'), 3)), ci(d, 'evening', allAt(blockReadings('evening'), 4))])
    expect(proposeWeights(short)).toBeNull()
    const pairs = weightPairs(short, { mood: 2 })
    expect(pairs.length).toBeGreaterThanOrEqual(8)
    const s = evaluateWeightCard(short, { mood: 2 })
    expect(s.n).toBe(pairs.length)
    expect(['little', 'unclear', 'promising', 'unhelpful']).toContain(s.tier)
    expect(evaluateWeightCard(short.slice(0, 6), { mood: 2 }).tier).toBe('little')
  })
})

describe('a card tested on purpose is scheduled until it has its eight (Part 33)', () => {
  it('is short while either arm has fewer than eight done coin-flip opportunities, and has its eight once both do', () => {
    const seven = [...obs('walk-ten', [1, 1, 1, 1, 1, 1, 1]), ...obs('nap-ten', [0, 0, 0, 0, 0, 0, 0, 0])]
    expect(hasItsEight(card(1), seven)).toBe(false)
    const eight = [...seven, ...obs('walk-ten', [1], { day: () => '2026-09-30' })]
    expect(hasItsEight(card(1), eight)).toBe(true)
    // Opportunities that were not coin flips, or were only partly done, do not count toward it.
    expect(hasItsEight(card(1), [...seven, ...obs('walk-ten', [1], { coinFlip: false, day: () => '2026-09-30' })])).toBe(false)
    expect(hasItsEight(card(1), [...seven, ...obs('walk-ten', [1], { arm: 'partly', day: () => '2026-09-30' })])).toBe(false)
  })
})
