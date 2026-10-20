import { describe, expect, it } from 'vitest'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { evaluateWeightCard, proposeWeights, weightPairs } from './weights'

// The readings' weight cards: proposed from a long enough record, judged on pairs.

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
