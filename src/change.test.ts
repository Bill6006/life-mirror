import { describe, expect, it } from 'vitest'
import { BEHIND_IT_STEPS, changesInWords, whenLabel, worsenedReadings } from './change'
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

describe('Anything going on? (stage 3, group 3)', () => {
  const previous = { answers: { ...morningAll(3) } }

  it('names a reading that worsened by two steps or more, each in its own direction', () => {
    // Mood down two, Stress up two, Irritation up three: all worse. Focus up two is better, and Energy down one is too small.
    const current: Answers = { ...morningAll(3), mood: 1, stress: 5, irritation: 5, focus: 5, energy: 2 }
    expect(worsenedReadings(current, 'morning', previous).sort()).toEqual(['irritation', 'mood', 'stress'])
  })

  it('counts only the six readings with a direction, and only readings both check-ins hold', () => {
    // Loneliness and Hunger have no worse; a reading the last check-in did not ask cannot have worsened.
    const current: Answers = { ...morningAll(3), loneliness: 5, hunger: 1, sleepQuality: 1 }
    expect(worsenedReadings(current, 'morning', previous)).toEqual([])
    expect(worsenedReadings({ mood: 1 }, 'afternoon', { answers: { energy: 5 } })).toEqual([])
  })

  it('says nothing with no earlier check-in, and holds at exactly the threshold', () => {
    expect(worsenedReadings(morningAll(1), 'morning', null)).toEqual([])
    expect(BEHIND_IT_STEPS).toBe(2)
    expect(worsenedReadings({ ...morningAll(3), mood: 2 }, 'morning', previous)).toEqual([])
  })
})
