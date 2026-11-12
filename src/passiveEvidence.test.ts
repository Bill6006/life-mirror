import { describe, expect, it } from 'vitest'
import { associationTier } from './associations'
import { checkin, day, offer, outcome } from './counted/testing'
import type { Card, CheckIn, Offer, Outcome } from './db'
import { passiveEvidence } from './evidenceFlow'

// Evidence's cards under the one standard (Phase 3, 2026-11-12), on a stand-in record. Eight weeks of evenings that
// all started the same; the next morning's stress read better only after the days the first passive item was done.

const FORTNIGHTS = 4
const each = (days: readonly number[]): number[] => Array.from({ length: FORTNIGHTS }, (_, f) => days.map((d) => 14 * f + d)).flat()
const P_DONE = each([0, 1, 3, 7])
const Q_DONE = each([0, 2, 5, 9])
const R_DONE = [1, 3, 7]
const card = (id: number, moveId: string): Card => ({ id, moveId, target: 'stress', worthwhile: 0.4, origin: 'passive', createdAt: '2026-01-01T08:00:00.000Z' }) as Card

function record(): { checkins: CheckIn[]; offers: Offer[]; outcomes: Outcome[] } {
  const checkins: CheckIn[] = []
  for (let n = 0; n < 14 * FORTNIGHTS; n++) {
    checkins.push(checkin(n, 'evening'))
    // The morning after a day the first item was done reads stress at 2; any other morning at 4.
    checkins.push(checkin(n + 1, 'morning', { answers: { stress: P_DONE.includes(n) ? 2 : 4 } }))
  }
  const offers: Offer[] = []
  const outcomes: Outcome[] = []
  let id = 1
  const rode = (passiveId: string, done: readonly number[], declined: readonly number[]): void => {
    for (const [days, result] of [[done, 'done'], [declined, 'no']] as const) {
      for (const n of days) {
        offers.push({ ...offer(id, n, 'walk-ten'), passiveId, skippedAt: null } as Offer)
        outcomes.push({ ...outcome(id, n, 'walk-ten', 'done'), passiveOutcome: result } as Outcome)
        id++
      }
    }
  }
  rode('p-card', P_DONE, each([2, 5, 9, 12]))
  rode('q-card', Q_DONE, each([4, 6, 10, 12]))
  rode('r-card', R_DONE, each([4, 6, 10, 12]))
  return { checkins, offers, outcomes }
}

describe('Evidence’s cards', () => {
  const { checkins, offers, outcomes } = record()
  const [p, q, r] = passiveEvidence([card(1, 'p-card'), card(2, 'q-card'), card(3, 'r-card')], checkins, offers, outcomes, day(14 * FORTNIGHTS))

  it('say promising only for a lead in the good direction, and a lead is the most a card says', () => {
    expect(p.association.compared).toMatchObject({ id: 'evidence.p-card', n: 16, enough: true })
    expect(p.association.diff).toBe(50)
    // Fifty points the good way on sixteen matched evenings: past chance after the family's correction, and still a lead.
    expect(p.standing).toBe('lead')
    expect(p.tier).toBe('promising')
  })

  it('say unclear where there is enough to compare and no clear pattern', () => {
    expect(q.association.compared).toMatchObject({ n: 16, enough: true })
    expect(q.standing).toBe('noPattern')
    expect(q.tier).toBe('unclear')
  })

  it('say little for a card done three times, where three used to be promising', () => {
    expect(r.association.times).toBe(3)
    expect(associationTier(r.association, 10)).toBe('promising')
    expect(r.standing).toBe('tooFew')
    expect(r.tier).toBe('little')
  })
})
