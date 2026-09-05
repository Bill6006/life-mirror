import { describe, expect, it } from 'vitest'
import { changesInWords, whenLabel } from './change'
import { blockReadings, type Answers, type Position } from './readings'

function morningAll(p: Position): Answers {
  return Object.fromEntries(blockReadings('morning').map((id) => [id, p]))
}

describe('the change since last time, in words', () => {
  it('calls the first reading the first', () => {
    const r = changesInWords({ mood: 3 }, 'evening', null, { day: '2026-09-05', block: 'evening' })
    expect(r.since).toBeNull()
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toContain('first reading')
  })

  it('reports steps up and down, largest first, then what stayed the same', () => {
    const previous = { day: '2026-09-05', block: 'morning' as const, answers: { ...morningAll(3), irritation: 4 as Position, focus: 2 as Position, stress: 2 as Position } }
    const current: Answers = { mood: 4, irritation: 1, energy: 3, hunger: 3, stress: 2 }
    const r = changesInWords(current, 'evening', previous, { day: '2026-09-05', block: 'evening' })
    expect(r.since).toBe('this morning')
    expect(r.lines).toEqual(['Irritation down three steps', 'Mood up one step', 'Unchanged: energy, hunger, stress'])
  })

  it('speaks of bands for sleep hours', () => {
    const previous = { day: '2026-09-04', block: 'morning' as const, answers: morningAll(3) }
    const r = changesInWords({ ...morningAll(3), sleepHours: 5 }, 'morning', previous, { day: '2026-09-05', block: 'morning' })
    expect(r.since).toBe('yesterday morning')
    expect(r.lines[0]).toBe('Sleep hours up two bands')
  })

  it('names older days by weekday within the week, then by date', () => {
    expect(whenLabel({ day: '2026-09-01', block: 'evening' }, { day: '2026-09-05', block: 'morning' })).toBe('Tuesday evening')
    expect(whenLabel({ day: '2026-08-20', block: 'evening' }, { day: '2026-09-05', block: 'morning' })).toMatch(/20 August|August 20/)
  })
})
