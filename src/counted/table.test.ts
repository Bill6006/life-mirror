import { describe, expect, it } from 'vitest'
import type { PrivateItem } from '../db'
import { forgetKeptPatterns, keptPatterns, type PatternEntry, patternTable, patternTableKept } from './table'
import { at, checkin, day, input } from './testing'

// The pattern table, on stand-in records (the counted foundation, 2026-11-12; in shadow).

// Eight weeks of evenings from Wednesday 2026-10-28. Its Saturdays are days 303, 310 and so on: eight of them.
const A = 300
const SPAN = 56
const saturday = (n: number): boolean => new Date(2026, 0, 1 + n).getDay() === 6
const evenings = (extras: (n: number) => object) => Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'evening', { extras: extras(A + i) }))
const TODAY = day(A + SPAN)
const entry = (kinds: PatternEntry[], id: string): PatternEntry => kinds.find((k) => k.kind === id) as PatternEntry

describe('the pattern table', () => {
  it('finds a chip tapped on one weekday, as k of n against the rest', () => {
    const table = patternTable(input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) }), TODAY)
    const dinner = entry(table.kinds, 'chip.dinner')
    expect(dinner).toMatchObject({ unit: 'day', known: 56, occurrences: 8, family: 7 })
    expect(dinner.cells.find((c) => c.split === 'weekday' && c.cell === '6')).toMatchObject({ k: 8, n: 8, restK: 0, m: 48, diff: 1, standing: 'pattern', direction: 'higher' })
    expect(dinner.cells.filter((c) => c.standing === 'pattern')).toHaveLength(1)
    // No morning was answered, so last night is unknown and that split holds nothing; no evening read low.
    expect(dinner.cells.find((c) => c.split === 'shortNight')).toMatchObject({ n: 0, standing: 'tooFew' })
    expect(dinner.cells.find((c) => c.split === 'lowEvening')).toMatchObject({ n: 0, standing: 'tooFew' })
  })

  it('leaves out a kind with nothing tested, so it starts small', () => {
    const table = patternTable(input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) }), TODAY)
    expect(table.kinds.map((k) => k.kind)).toEqual(['chip.dinner'])
    expect(table.builtFor).toBe(TODAY)
    // A kind the record can speak for with too few to test keeps its counts alone, and the list keeps its own order.
    expect(table.untested.find((k) => k.kind === 'chip.napped')).toEqual({ kind: 'chip.napped', unit: 'day', label: 'a nap', category: 'dayRecord', private: false, known: 56, occurrences: 0 })
    expect(table.order.indexOf('chip.dinner')).toBeLessThan(table.order.indexOf('chip.napped'))
    expect(table.order).toHaveLength(table.kinds.length + table.untested.length)
  })

  it('carries each kind as the app names it, with its switch and its cut-off', () => {
    const mornings = Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'morning', { answers: { sleepHours: saturday(A + i) ? 2 : 3 } }))
    const short = entry(patternTable(input({ checkins: mornings }), TODAY).kinds, 'sleep.short')
    expect(short).toMatchObject({ label: 'a short night (under six hours)', category: 'dayRecord', private: false, cutoff: 'under six hours' })
  })

  it('counts the level as two kinds, a check-in that read under 40 and one that read 80 or more', () => {
    // Saturdays read 0 out of 100, every other evening 50: low on 8 of 8 Saturdays and on none of the 48 others.
    const low = patternTable(input({ checkins: Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'evening', { level: saturday(A + i) ? 1 : 3 })) }), TODAY)
    expect(entry(low.kinds, 'level.low')).toMatchObject({ unit: 'checkin', known: 56, occurrences: 8, cutoff: 'under 40 out of 100' })
    expect(entry(low.kinds, 'level.low').cells.find((c) => c.split === 'weekday' && c.cell === '6')).toMatchObject({ k: 8, n: 8, restK: 0, m: 48, standing: 'pattern', direction: 'higher' })
    expect(low.untested.find((k) => k.kind === 'level.high')).toMatchObject({ known: 56, occurrences: 0 })
    // Saturdays read 100, the others 75: high on the Saturdays alone, since 75 is under 80.
    const high = patternTable(input({ checkins: Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'evening', { level: saturday(A + i) ? 5 : 4 })) }), TODAY)
    expect(entry(high.kinds, 'level.high')).toMatchObject({ occurrences: 8, cutoff: '80 or more out of 100' })
    expect(high.untested.find((k) => k.kind === 'level.low')).toMatchObject({ occurrences: 0 })
  })

  it('gives the level in each cell as an average and as counts in the five bands, compared with nothing', () => {
    const table = patternTable(input({ checkins: Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'evening', { level: saturday(A + i) ? 1 : 3 })) }), TODAY)
    // Firing, Solid, Getting by, Worn down, Empty: the eight Saturdays read 0, in Empty; the 48 others read 50, in Getting by.
    expect(table.level.find((l) => l.split === 'weekday' && l.cell === '6')).toEqual({ split: 'weekday', cell: '6', n: 8, mean: 0, bands: [0, 0, 0, 0, 8], restN: 48, restMean: 50 })
    expect(table.level.find((l) => l.split === 'weekday' && l.cell === '0')).toEqual({ split: 'weekday', cell: '0', n: 8, mean: 50, bands: [0, 0, 8, 0, 0], restN: 48, restMean: 41.7 })
    expect(table.level.find((l) => l.split === 'checkin' && l.cell === 'evening')).toMatchObject({ n: 56, restN: 0 })
    // No morning was answered, so last night is unknown at every check-in and that split holds no cell.
    expect(table.level.some((l) => l.split === 'shortNight')).toBe(false)
    expect(table.level.every((l) => !('p' in l) && !('standing' in l))).toBe(true)
  })

  it('built a kind at a time gives the same table, and works a kind out again only when its occasions changed', async () => {
    forgetKeptPatterns()
    const record = input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) })
    let pauses = 0
    const pause = async () => void pauses++
    const first = await patternTableKept(record, TODAY, pause)
    expect(first).toEqual(patternTable(record, TODAY))
    expect(pauses).toBeGreaterThan(10)
    expect(keptPatterns()).toBe(1)
    // The same record again: the kept comparisons are handed back, the very same cells.
    const again = await patternTableKept(record, TODAY, pause)
    expect(entry(again.kinds, 'chip.dinner').cells).toBe(entry(first.kinds, 'chip.dinner').cells)
    // A check-in that showed nothing of the kind leaves it alone; one more dinner works it out again.
    const beside = await patternTableKept(input({ checkins: [...record.checkins, checkin(A, 'morning')] }), TODAY, pause)
    expect(entry(beside.kinds, 'chip.dinner').cells).toBe(entry(first.kinds, 'chip.dinner').cells)
    const moved = input({ checkins: record.checkins.map((c) => (c.day === day(A) ? checkin(A, 'evening', { extras: { dinner: true } }) : c)) })
    const changed = await patternTableKept(moved, TODAY, pause)
    expect(entry(changed.kinds, 'chip.dinner').cells).not.toBe(entry(first.kinds, 'chip.dinner').cells)
    expect(entry(changed.kinds, 'chip.dinner')).toMatchObject({ occurrences: 9 })
    expect(changed).toEqual(patternTable(moved, TODAY))
    forgetKeptPatterns()
  })

  it('is the same for the same record', () => {
    const record = input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) })
    expect(patternTable(record, TODAY)).toEqual(patternTable(record, TODAY))
  })

  it('counts only the days before the day it is built on', () => {
    const record = input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) })
    // Built four weeks in: four Saturdays, under eight in the cell, and nothing is tested.
    expect(patternTable(record, day(A + 28)).kinds).toEqual([])
  })

  it('does not move when a check-in is added that showed nothing of the kind', () => {
    const record = input({ checkins: evenings((n) => (saturday(n) ? { dinner: true } : {})) })
    const more = input({ checkins: [...record.checkins, ...Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'morning'))] })
    expect(patternTable(more, TODAY).kinds).toEqual(patternTable(record, TODAY).kinds)
  })

  it('splits by what came before the day: a short night, and a low evening the day before', () => {
    // A short night before every Saturday, and dinner on Saturdays: 8 of 8 after a short night, 0 of 48 otherwise.
    const mornings = Array.from({ length: SPAN }, (_, i) => checkin(A + i, 'morning', { answers: { sleepHours: saturday(A + i) ? 2 : 3 } }))
    const table = patternTable(input({ checkins: [...mornings, ...evenings((n) => (saturday(n) ? { dinner: true } : {}))] }), TODAY)
    const dinner = entry(table.kinds, 'chip.dinner')
    expect(dinner.cells.find((c) => c.split === 'shortNight')).toMatchObject({ cell: 'yes', k: 8, n: 8, restK: 0, m: 48, standing: 'pattern' })
    expect(dinner.family).toBe(8)
    // A short night is the same answer as the sleep kinds, so it is no split of them.
    expect(entry(table.kinds, 'sleep.short').cells.some((c) => c.split === 'shortNight')).toBe(false)
    expect(entry(table.kinds, 'sleep.short').cells.find((c) => c.split === 'weekday' && c.cell === '6')).toMatchObject({ k: 8, n: 8, standing: 'pattern' })
  })

  it('splits a check-in kind by the check-in of the day, shuffled within the day', () => {
    // A private item on screen at every check-in for thirty days, tapped in the evening on the first twenty.
    const item: PrivateItem = { id: 7, name: 'a private thing', createdAt: at(A - 5, 9), archived: 0 }
    const checkins = Array.from({ length: 30 }, (_, i) => (['morning', 'afternoon', 'evening'] as const).map((block) => checkin(A + i, block, { extras: { privateShown: { '7': true }, ...(block === 'evening' && i < 20 ? { private: { '7': true as const } } : {}) } }))).flat()
    const table = patternTable(input({ checkins, items: [item] }), day(A + 30))
    const item7 = entry(table.kinds, 'private.7')
    expect(item7).toMatchObject({ unit: 'checkin', known: 90, occurrences: 20 })
    expect(item7.cells.find((c) => c.split === 'checkin' && c.cell === 'evening')).toMatchObject({ k: 20, n: 30, restK: 0, m: 60, standing: 'pattern', direction: 'higher' })
    // Seven weekdays and three check-ins were tested: ten, and the family says so.
    expect(item7.family).toBe(10)
  })
})
