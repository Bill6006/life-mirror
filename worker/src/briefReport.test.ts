import { describe, expect, it } from 'vitest'
import { briefReportRow } from './index'
import type { BriefRow } from './turso'

// The brief report shows how a line was written and what decides how long it stays on Now: the
// facts it cites, its one tap and the clock times its words name. Never its words (the final
// checklist, 2026-09-25).

const row: BriefRow = {
  id: '2026-09-25:brief',
  day: '2026-09-25',
  kind: 'brief',
  text: 'Two things went undone this week; do the smallest before 5:30 PM, then rest after 8:00 PM.',
  mode: 'warning',
  factIds: ['necessities.3d', 'week.today'],
  cardIds: [],
  model: 'claude-opus-5-5',
  at: '2026-09-25T14:31:20.000Z',
  factsDay: '2026-09-25',
  action: { kind: 'plan', aimId: 2, cue: 'afterPickup' },
  writer: 'claude',
}

describe('the brief report (the final checklist)', () => {
  it('shows the cited facts, the one tap and the times named, and never the words', () => {
    const r = briefReportRow(row)
    expect(r).toMatchObject({ factIds: ['necessities.3d', 'week.today'], action: { kind: 'plan', aimId: 2, cue: 'afterPickup' }, timesNamed: ['17:30', '20:00'], writer: 'claude' })
    expect(JSON.stringify(r)).not.toContain('undone')
    expect(r).not.toHaveProperty('text')
    expect(r).not.toHaveProperty('parts')
  })

  it('shows an empty list and no tap for a line that names no time and offers none', () => {
    expect(briefReportRow({ ...row, text: 'A calm line.', action: null })).toMatchObject({ action: null, timesNamed: [] })
  })
})
