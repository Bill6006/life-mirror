import { describe, expect, it } from 'vitest'
import type { CheckIn } from './db'
import type { Answers } from './readings'
import { movesTogether, pearson, ranks, spearman } from './stats'

const mk = (i: number, answers: Answers): CheckIn => ({
  day: `2026-09-${String(1 + i).padStart(2, '0')}`,
  block: 'evening',
  answers,
  startedAt: '',
  completedAt: 'x',
  updatedAt: '',
  activeMs: 0,
})

describe('moves together', () => {
  it('ranks with ties sharing a rank', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4])
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2])
  })

  it('finds perfect agreement, perfect opposition, and nothing in a constant', () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1)
    expect(spearman([3, 3, 3, 3], [1, 2, 3, 4])).toBeNull()
    expect(pearson([1, 2], [1, 2])).toBeNull()
  })

  it('shows only pairs with enough shared check-ins, strongest first', () => {
    const all = Array.from({ length: 8 }, (_, i) => mk(i, { mood: ((i % 5) + 1) as 1, energy: ((i % 5) + 1) as 1, stress: ((4 - (i % 5)) + 1) as 1, hunger: i < 3 ? 3 : undefined }))
    const pairs = movesTogether(all)
    const key = (p: { a: string; b: string }) => `${p.a}-${p.b}`
    expect(pairs.map(key)).toContain('mood-energy')
    expect(pairs.map(key)).toContain('mood-stress')
    expect(pairs.map(key)).not.toContain('mood-hunger')
    expect(pairs[0].n).toBe(8)
    expect(Math.abs(pairs[0].rho)).toBeCloseTo(1)
    const moodStress = pairs.find((p) => key(p) === 'mood-stress')
    expect(moodStress?.rho).toBeCloseTo(-1)
    expect(movesTogether(all.slice(0, 5))).toEqual([])
  })
})
