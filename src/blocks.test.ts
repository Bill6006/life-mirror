import { describe, expect, it } from 'vitest'
import { blockAt, compareSlots, daysBetween } from './blocks'

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min)

describe('blocks of the day', () => {
  it('runs morning to 11:59, afternoon to 16:59, evening after', () => {
    expect(blockAt(at(2026, 9, 5, 4, 0))).toEqual({ day: '2026-09-05', block: 'morning' })
    expect(blockAt(at(2026, 9, 5, 11, 59))).toEqual({ day: '2026-09-05', block: 'morning' })
    expect(blockAt(at(2026, 9, 5, 12, 0))).toEqual({ day: '2026-09-05', block: 'afternoon' })
    expect(blockAt(at(2026, 9, 5, 16, 59))).toEqual({ day: '2026-09-05', block: 'afternoon' })
    expect(blockAt(at(2026, 9, 5, 17, 0))).toEqual({ day: '2026-09-05', block: 'evening' })
    expect(blockAt(at(2026, 9, 5, 23, 59))).toEqual({ day: '2026-09-05', block: 'evening' })
  })

  it('keeps the small hours with the previous evening', () => {
    expect(blockAt(at(2026, 9, 6, 0, 30))).toEqual({ day: '2026-09-05', block: 'evening' })
    expect(blockAt(at(2026, 9, 6, 3, 59))).toEqual({ day: '2026-09-05', block: 'evening' })
    expect(blockAt(at(2026, 10, 1, 1, 0))).toEqual({ day: '2026-09-30', block: 'evening' })
  })

  it('orders slots by day, then block', () => {
    expect(compareSlots({ day: '2026-09-05', block: 'evening' }, { day: '2026-09-06', block: 'morning' })).toBeLessThan(0)
    expect(compareSlots({ day: '2026-09-05', block: 'morning' }, { day: '2026-09-05', block: 'afternoon' })).toBeLessThan(0)
    expect(compareSlots({ day: '2026-09-05', block: 'evening' }, { day: '2026-09-05', block: 'evening' })).toBe(0)
    expect(daysBetween('2026-09-01', '2026-09-05')).toBe(4)
  })
})
