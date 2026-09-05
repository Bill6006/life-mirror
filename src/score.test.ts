import { describe, expect, it } from 'vitest'
import type { CheckIn } from './db'
import { blockReadings, type Answers, type Position, type ReadingId } from './readings'
import { CONTEXT_IDS, INGREDIENT_IDS, latestFullReading, pointsFor, readingOutOf100, stanceOf } from './score'

const allAt = (ids: readonly ReadingId[], p: Position): Answers => Object.fromEntries(ids.map((id) => [id, p]))

describe('the reading out of 100', () => {
  it('is the equal-weight mean of the six directional readings, reversed where lower is better', () => {
    expect(pointsFor('mood', 5)).toBe(100)
    expect(pointsFor('stress', 5)).toBe(0)
    expect(pointsFor('irritation', 1)).toBe(100)
    expect(pointsFor('energy', 3)).toBe(50)
    // mood 100, energy 50, focus 50, stress 100 (position 1, reversed), overwhelm 50, irritation 50 → 400/6
    const r = readingOutOf100({ ...allAt(blockReadings('morning'), 3), mood: 5, stress: 1 }, blockReadings('morning'))
    expect(r).toEqual({ value: 67, stance: 'Stabilize', used: 6, total: 6 })
  })

  it('uses only the ingredients a block asks, and says how many', () => {
    expect(readingOutOf100(allAt(blockReadings('evening'), 3), blockReadings('evening'))).toEqual({ value: 50, stance: 'Stabilize', used: 4, total: 6 })
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

  it('names the stance at the plan thresholds', () => {
    expect(stanceOf(0)).toBe('Protect')
    expect(stanceOf(24)).toBe('Protect')
    expect(stanceOf(25)).toBe('Recover')
    expect(stanceOf(49)).toBe('Recover')
    expect(stanceOf(50)).toBe('Stabilize')
    expect(stanceOf(74)).toBe('Stabilize')
    expect(stanceOf(75)).toBe('Build')
    expect(stanceOf(100)).toBe('Build')
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
    expect(latestFullReading([short, full])?.reading).toEqual({ value: 75, stance: 'Build', used: 3, total: 6 })
  })
})
