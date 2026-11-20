import { describe, expect, it } from 'vitest'
import { addDays, BLOCKS } from './blocks'
import { weekdayOf } from './counted/occasions'
import { chooseModel, predict } from './forecast'
import { slotKey } from './observe'
import { chooseOfFive, FIFTH, FIFTH_ON, FIFTH_WAY, fifthWayOf } from './weekdayPattern'

// The week ahead's fifth way (Batch 2, item 5), switched off and wired to nothing: what it reads, and only from before
// the day forecast. Stand-in records only.

const START = '2026-03-02'

/** A seeded stand-in record of `days` days, every slot answered: a level, noise, and a shift on one weekday at one check-in. */
function record(days: number, seed: number, shift: { weekday: number; block: string; points: number } | null = null): Map<string, number> {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const values = new Map<string, number>()
  for (let d = 0; d < days; d++) {
    const day = addDays(START, d)
    for (const block of BLOCKS) {
      const noise = (next() + next() + next() - 1.5) * 16
      const on = shift && weekdayOf(day) === shift.weekday && block === shift.block ? shift.points : 0
      values.set(slotKey(day, block), Math.max(0, Math.min(100, 60 + noise + on)))
    }
  }
  return values
}

describe('the fifth way, switched off', () => {
  it('is off, and nothing in the app runs it', () => {
    expect(FIFTH_ON).toBe(false)
    expect(FIFTH_WAY).toBe('weekdayPattern')
  })
})

describe('what the fifth way reads', () => {
  it('is the same-block way, number for number, where no weekday at any check-in stands as a steady pattern', () => {
    const values = record(150, 7)
    const fifth = fifthWayOf(values)
    const day = addDays(START, 140)
    expect(fifth.cells(day).filter((c) => c.pattern)).toEqual([])
    for (const block of BLOCKS) expect(fifth.predict(day, block)).toBe(predict('sameBlock', values, day, block))
  })

  it('moves only the weekday and check-in that stand as a steady pattern, the way they differ', () => {
    // Mondays' mornings 25 points lower over 150 days.
    const values = record(150, 11, { weekday: 1, block: 'morning', points: -25 })
    const fifth = fifthWayOf(values)
    const monday = addDays(START, 147)
    expect(weekdayOf(monday)).toBe(1)
    const held = fifth.cells(monday).filter((c) => c.pattern)
    expect(held.map((c) => `${c.block}.${c.weekday}`)).toEqual(['morning.1'])
    expect(held[0].offset).toBeLessThan(-10)
    expect(fifth.predict(monday, 'morning') as number).toBeLessThan(predict('sameBlock', values, monday, 'morning') as number)
    expect(fifth.predict(monday, 'evening')).toBe(predict('sameBlock', values, monday, 'evening'))
    const tuesday = addDays(monday, 1)
    expect(fifth.predict(tuesday, 'morning')).toBe(predict('sameBlock', values, tuesday, 'morning'))
  })

  it('reads only the record before the day it forecasts: changing that day or any after it changes nothing', () => {
    const values = record(150, 13, { weekday: 1, block: 'morning', points: -25 })
    const day = addDays(START, 133)
    const before = fifthWayOf(values)
    const cells = before.cells(day)
    const points = BLOCKS.map((b) => before.predict(day, b))
    const changed = new Map(values)
    for (let d = 133; d < 150; d++) for (const b of BLOCKS) changed.set(slotKey(addDays(START, d), b), d % 2 ? 5 : 95)
    const after = fifthWayOf(changed)
    expect(after.cells(day)).toEqual(cells)
    expect(BLOCKS.map((b) => after.predict(day, b))).toEqual(points)
    // A change the day before does reach it.
    const yesterday = new Map(values)
    for (const b of BLOCKS) yesterday.set(slotKey(addDays(day, -1), b), 0)
    expect(BLOCKS.map((b) => fifthWayOf(yesterday).predict(day, b))).not.toEqual(points)
  })

  it('is picked only when it beats each of the four and clears every part of the margin', () => {
    const values = record(150, 17, { weekday: 1, block: 'morning', points: -30 })
    const today = addDays(START, 150)
    const four = chooseModel(values, today)
    expect(four).not.toBeNull()
    const loose = chooseOfFive(values, today, fifthWayOf(values), { ...FIFTH, minSlots: 1, minGain: 0, minClear: 0 })
    const strict = chooseOfFive(values, today, fifthWayOf(values), { ...FIFTH, minSlots: 1000 })
    expect(strict?.picked).toBe(false)
    expect(strict?.way).toBe(four?.model)
    if (loose?.picked) expect(loose.way).toBe(FIFTH_WAY)
    else expect(loose?.way).toBe(four?.model)
  })
})
