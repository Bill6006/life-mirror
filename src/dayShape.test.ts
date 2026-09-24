import { describe, expect, it } from 'vitest'
import { heldBedtime, heldPickup } from './dayShape'

// Part 33: "She's away today" clears the drop-off, the pickup and her bedtime from the day, while
// the record keeps the week's shape so the chip can be taken back.

describe('what a day holds', () => {
  const daycare = { withHer: true, pickupTime: '17:00', soloUntil: '20:00' }

  it('holds the pickup and her bedtime while she is with you', () => {
    expect(heldPickup(daycare)).toBe('17:00')
    expect(heldBedtime(daycare)).toBe('20:00')
  })

  it('holds neither on a day she is away, whatever the week wrote', () => {
    expect(heldPickup({ ...daycare, withHer: false })).toBeNull()
    expect(heldBedtime({ ...daycare, withHer: false })).toBeNull()
  })

  it('holds no pickup on a day without one, and nothing for a day it does not know', () => {
    expect(heldPickup({ ...daycare, pickupTime: null })).toBeNull()
    expect(heldPickup(null)).toBeNull()
    expect(heldBedtime(undefined)).toBeNull()
  })
})
