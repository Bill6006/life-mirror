import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { factSheet } from './brainFlow'
import { db, getSettings, updateSettings } from './db'
import { whereWords } from './facts'

// Part 43 on the sheet: where today and yesterday were spent, as kinds of place in order; no tag, no
// coordinate; every other fact as it was. Claude's to read only through its own gate (the Worker).

describe('the location facts', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await updateSettings((s) => ({ ...s, location: { on: true, area: { lat: 51.5, lon: -0.1, at: '' } } }))
  })

  it('say each part of the day in order, a change within a part as “then”, and nothing for a part it did not see', () => {
    expect(whereWords({ morning: ['home'], afternoon: ['work', 'home'] })).toEqual({ text: 'the morning at Home; the afternoon at Work, then at Home', values: { morning: 'home', afternoon: 'work,home' } })
    expect(whereWords({ evening: ['away'] })?.text).toBe('the evening away from home, in a different area')
    expect(whereWords({ afternoon: ['regular', 'out'] })?.text).toBe('the afternoon at a regular place, then out, at no place you named')
    expect(whereWords(undefined)).toBeNull()
    expect(whereWords({})).toBeNull()
  })

  it('ride the sheet for today and yesterday, with no tag and no coordinate, leaving the other facts as they were', async () => {
    const s = await getSettings()
    const todayRow = { day: '2026-10-20', weekday: 2 as const, withHer: s.week.livesWithMe, studyNight: false, churchDay: false, pickupTime: null, soloUntil: s.week.soloUntil, changed: false, createdAt: '' }
    await db.days.put(todayRow)
    await db.days.put({ ...todayRow, day: '2026-10-19', weekday: 1 })
    const before = await factSheet('2026-10-20', new Date(2026, 9, 20, 11, 0))
    await db.days.put({ ...todayRow, where: { morning: ['home', 'work'] } })
    await db.days.put({ ...todayRow, day: '2026-10-19', weekday: 1, where: { morning: ['home'], afternoon: ['work'], evening: ['home'] } })
    const sheet = await factSheet('2026-10-20', new Date(2026, 9, 20, 11, 0))
    const today = sheet.facts.find((f) => f.id === 'location.today')
    const yesterday = sheet.facts.find((f) => f.id === 'location.yesterday')
    expect(today).toEqual({ id: 'location.today', tags: [], text: 'Where today has been so far, as Life Mirror saw it while open: the morning at Home, then at Work.', values: { day: '2026-10-20', morning: 'home,work' } })
    expect(yesterday?.text).toBe('Where yesterday was, as Life Mirror saw it while open: the morning at Home; the afternoon at Work; the evening at Home.')
    for (const f of [today, yesterday]) expect(JSON.stringify(f)).not.toMatch(/51\.5|-0\.1|lat|lon/)
    expect(sheet.facts.filter((f) => !f.id.startsWith('location.'))).toEqual(before.facts.filter((f) => !f.id.startsWith('location.')))
    expect(sheet.shortlist).toEqual(before.shortlist)
  })
})
