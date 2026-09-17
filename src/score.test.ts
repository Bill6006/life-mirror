import { describe, expect, it } from 'vitest'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { bandOf, CONTEXT_IDS, INGREDIENT_IDS, latestFullReading, learnedWeights, pointsFor, readingOutOf100, setLearnedWeights } from './score'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))

describe('the reading out of 100', () => {
  it('is the equal-weight mean of the six directional readings, reversed where lower is better', () => {
    expect(pointsFor('mood', 5)).toBe(100)
    expect(pointsFor('stress', 5)).toBe(0)
    expect(pointsFor('irritation', 1)).toBe(100)
    expect(pointsFor('energy', 3)).toBe(50)
    // mood 100, energy 50, focus 50, stress 100 (position 1, reversed), overwhelm 50, irritation 50 → 400/6
    const r = readingOutOf100({ ...allAt(blockReadings('morning'), 3), mood: 5, stress: 1 }, blockReadings('morning'))
    expect(r).toEqual({ value: 67, used: 6, total: 6, weighted: false })
  })

  it('uses only the ingredients a block asks, and says how many', () => {
    expect(readingOutOf100(allAt(blockReadings('evening'), 3), blockReadings('evening'))).toEqual({ value: 50, used: 6, total: 6, weighted: false })
    expect(readingOutOf100(allAt(blockReadings('afternoon'), 3), blockReadings('afternoon'))?.used).toBe(6)
    expect(readingOutOf100({ mood: 3, energy: 3, stress: 3 }, ['mood', 'energy', 'stress'])?.used).toBe(3)
  })

  it('never lets a context reading in', () => {
    for (const id of CONTEXT_IDS) expect(INGREDIENT_IDS).not.toContain(id)
    const r = readingOutOf100({ ...allAt(blockReadings('morning'), 3), hunger: 5, sleepHours: 1, confidence: 1 }, blockReadings('morning'))
    expect(r?.value).toBe(50)
  })

  it('is Incomplete, not a number, while an asked ingredient is missing', () => {
    const a = allAt(blockReadings('morning'), 3)
    delete a.focus
    expect(readingOutOf100(a, blockReadings('morning'))).toBeNull()
    // A missing context reading does not make it incomplete.
    const b = allAt(blockReadings('morning'), 3)
    delete b.hunger
    expect(readingOutOf100(b, blockReadings('morning'))?.value).toBe(50)
  })

  it('reverses every reading that is better lower, at both ends', () => {
    for (const id of ['stress', 'overwhelm', 'irritation'] as const) {
      expect(pointsFor(id, 1), id).toBe(100)
      expect(pointsFor(id, 5), id).toBe(0)
    }
    for (const id of ['mood', 'energy', 'focus'] as const) {
      expect(pointsFor(id, 1), id).toBe(0)
      expect(pointsFor(id, 5), id).toBe(100)
    }
  })

  it('rounds to the nearest whole number, a half up, so every reading is one of twenty-five values', () => {
    // 100 + 100 + 75 + 50 + 50 + 0 = 375, a mean of 62.5.
    const a: Answers = { ...allAt(blockReadings('morning'), 3), mood: 5, energy: 5, focus: 4, irritation: 5 }
    expect(readingOutOf100(a, blockReadings('morning'))?.value).toBe(63)
    const seen = new Set<number>()
    for (let sum = 0; sum <= 600; sum += 25) seen.add(Math.round(sum / 6))
    expect(seen.size).toBe(25)
  })

  it('names the band at the plan boundaries, endpoints shown', () => {
    expect(bandOf(0)).toBe('empty')
    expect(bandOf(19)).toBe('empty')
    expect(bandOf(20)).toBe('wornDown')
    expect(bandOf(39)).toBe('wornDown')
    expect(bandOf(40)).toBe('gettingBy')
    expect(bandOf(59)).toBe('gettingBy')
    expect(bandOf(60)).toBe('solid')
    expect(bandOf(79)).toBe('solid')
    expect(bandOf(80)).toBe('firing')
    expect(bandOf(100)).toBe('firing')
  })

  it('applies learned weights only once set, says so, and is equal-weight again once cleared', () => {
    const a: Answers = { ...allAt(blockReadings('morning'), 3), mood: 5 }
    expect(readingOutOf100(a, blockReadings('morning'))).toEqual({ value: 58, used: 6, total: 6, weighted: false })
    setLearnedWeights({ mood: 2 })
    expect(learnedWeights()).toEqual({ mood: 2 })
    // (2 × 100 + 5 × 50) / 7
    expect(readingOutOf100(a, blockReadings('morning'))).toEqual({ value: 64, used: 6, total: 6, weighted: true })
    setLearnedWeights({})
    expect(learnedWeights()).toBeNull()
    expect(readingOutOf100(a, blockReadings('morning'))?.weighted).toBe(false)
  })

  it('takes the last full reading from the latest completed check-in and never from an incomplete one', () => {
    const mk = (day: string, block: CheckIn['block'], answers: Answers, completed: boolean): CheckIn => ({
      day,
      block,
      answers,
      startedAt: '',
      completedAt: completed ? '2026-09-05T10:00:00.000Z' : null,
      updatedAt: '',
      activeMs: 0,
    })
    const full = mk('2026-09-05', 'morning', allAt(blockReadings('morning'), 3), true)
    const partial = mk('2026-09-05', 'afternoon', { mood: 5, energy: 5 }, false)
    expect(latestFullReading([partial, full])?.checkin).toBe(full)
    expect(latestFullReading([partial])).toBeNull()
    // A short-depth check-in fixed its own asked set when it began.
    const short = { ...mk('2026-09-05', 'evening', { mood: 4, energy: 4, stress: 2 }, true), asked: ['mood', 'energy', 'stress'] }
    expect(latestFullReading([short, full])?.reading).toEqual({ value: 75, used: 3, total: 6, weighted: false })
  })
})
