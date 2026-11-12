import { describe, expect, it } from 'vitest'
import type { PrivateItem } from '../db'
import { type PatternEntry, patternTable } from './table'
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
