import { describe, expect, it } from 'vitest'
import type { FactSheet } from '../../src/factTypes'
import { workoutReport } from './workoutReport'

// The final checklist, item 4: the other app's latest sessions read the one way the phone reads
// them, and the workout facts on the newest sheet. Dates, fields and counts; never the words.

const full = JSON.stringify({
  completedAt: '2026-09-24T23:10:00.000Z',
  startedAt: '2026-09-24T22:05:00.000Z',
  elapsedSeconds: 3900,
  title: 'Push + arms',
  endedEarly: false,
  entries: [{ sets: [{ kind: 'warmup', rir: 5 }, { kind: 'working', rir: 2 }, { kind: 'working', rir: 1 }, { kind: 'working', completed: false, rir: 0 }] }],
  rating: { effort: 'too-hard', energyAfter: 2 },
})
const bare = JSON.stringify({ completedAt: '2026-09-22T12:00:00.000Z' })

const sheet = {
  day: '2026-09-25',
  facts: [
    { id: 'workout.last', tags: [], text: 'The last session: Push + arms.', values: { day: '2026-09-24', sets: 2, effort: 'too-hard' }, n: 1 },
    { id: 'assoc.eveningWorkout', tags: [], text: 'Mornings after an evening session…', values: { times: 4, diff: 3 }, n: 4, tier: 'little' },
    { id: 'week.today', tags: [], text: 'Friday.', values: {} },
  ],
} as unknown as FactSheet

describe('the Workout Conductor sanity report (the final checklist, item 4)', () => {
  it('reads each session as the phone does, and says which fields it holds', () => {
    const r = workoutReport([{ id: 'b', body: bare }, { id: 'a', body: full }, { id: 'x', body: 'not json' }], sheet)
    expect(r).toMatchObject({ rowsRead: 3, unreadable: 1, latest: '2026-09-24', sheet: '2026-09-25' })
    expect(r.sessions[0]).toEqual({ day: '2026-09-24', minutes: true, startedAt: true, type: true, endedEarly: true, workingSets: 2, effort: true, energyAfter: true, reserve: true, imported: false })
    expect(r.sessions[1]).toEqual({ day: '2026-09-22', minutes: false, startedAt: false, type: false, endedEarly: false, workingSets: null, effort: false, energyAfter: false, reserve: false, imported: false })
  })

  it('lists the workout facts the comparisons stand on, by id, count and field names', () => {
    const r = workoutReport([], sheet)
    expect(r.facts).toEqual([
      { id: 'workout.last', n: 1, tier: null, fields: ['day', 'effort', 'sets'] },
      { id: 'assoc.eveningWorkout', n: 4, tier: 'little', fields: ['diff', 'times'] },
    ])
  })

  it('never says a session’s title or a rating’s value', () => {
    const text = JSON.stringify(workoutReport([{ id: 'a', body: full }], sheet))
    expect(text).not.toContain('Push')
    expect(text).not.toContain('too-hard')
  })
})
