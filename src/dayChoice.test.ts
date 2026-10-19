import { describe, expect, it } from 'vitest'
import { bodyByHand, dayByHand } from './dayChoice'

// A day's record and the choices made in it by hand (2026-10-19): one rule for the database, the sync and the second copy
// of the queue, so a day only made from the week's shape never replaces one the owner changed.

describe('a day changed by hand', () => {
  it('is a chip tapped, a change stamped, or a learning week answered, and nothing else', () => {
    expect(dayByHand({ changed: true })).toBe(true)
    expect(dayByHand({ changed: false, updatedAt: '2026-10-19T08:00:00.000Z' })).toBe(true)
    // An answer kept before answers were stamped still counts.
    expect(dayByHand({ changed: false, weekAnswer: 'notNow' })).toBe(true)
    expect(dayByHand({ changed: false })).toBe(false)
    expect(dayByHand({ changed: false, updatedAt: '' })).toBe(false)
    expect(dayByHand({ changed: 'yes' as unknown as boolean })).toBe(false)
    expect(dayByHand(null)).toBe(false)
    expect(dayByHand(undefined)).toBe(false)
  })

  it('reads the same from the record as the queue and the cloud carry it', () => {
    expect(bodyByHand(JSON.stringify({ day: '2026-10-19', changed: true }))).toBe(true)
    expect(bodyByHand(JSON.stringify({ day: '2026-10-19', weekAnswer: 'yes' }))).toBe(true)
    expect(bodyByHand(JSON.stringify({ day: '2026-10-19', changed: false }))).toBe(false)
    // A deletion, an empty body and one that does not parse are no change by hand.
    expect(bodyByHand(null)).toBe(false)
    expect(bodyByHand('')).toBe(false)
    expect(bodyByHand('{not json')).toBe(false)
  })
})
