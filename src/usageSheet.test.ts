import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { factSheet, writeFactsRow } from './brainFlow'
import { db } from './db'
import { usageFactsToday } from './useRead'

// Follow-up F1 on the phone: the day's sheet carries the usage facts the Data and privacy screen
// shows, counted by the one rule; they leave the phone's own ranking and every other fact as they
// were; and the facts row that syncs to your own database carries them, for the Worker to filter.

const TODAY = '2026-10-20'
const NOW = new Date(2026, 9, 20, 9, 30)

describe('the usage facts on the day’s sheet', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    const use = (day: string, kind: 'screen' | 'checkinOpened' | 'lineWhy' | 'appOpened', what?: string) => db.useLog.add({ day, at: `${day}T13:00:00.000Z`, kind, ...(what ? { what } : {}) })
    await use('2026-10-01', 'screen', 'now')
    await use('2026-10-16', 'appOpened', 'launch')
    await use('2026-10-17', 'checkinOpened', 'morning')
    await use('2026-10-18', 'lineWhy')
    await use('2026-10-19', 'screen', 'evidence')
    await db.checkins.add({ day: '2026-10-19', block: 'morning', answers: { mood: 3, sleepHours: 2 }, startedAt: '2026-10-19T12:00:00.000Z', completedAt: '2026-10-19T12:01:00.000Z', updatedAt: '2026-10-19T12:01:00.000Z', activeMs: 60_000 })
  })

  it('are the ones Data and privacy shows, built by the same rule', async () => {
    const sheet = await factSheet(TODAY, NOW)
    const onSheet = sheet.facts.filter((f) => f.id.startsWith('usage.'))
    expect(onSheet.length).toBeGreaterThan(0)
    expect(onSheet).toEqual(await usageFactsToday(TODAY))
  })

  it('leave the phone’s own ranking and every other fact as they were', async () => {
    const withUse = await factSheet(TODAY, NOW)
    await db.useLog.clear()
    const without = await factSheet(TODAY, NOW)
    expect(without.facts.some((f) => f.id.startsWith('usage.'))).toBe(false)
    expect(withUse.facts.filter((f) => !f.id.startsWith('usage.'))).toEqual(without.facts)
    expect(withUse.shortlist).toEqual(without.shortlist)
  })

  it('ride the facts row that syncs to your own database', async () => {
    await writeFactsRow(TODAY, NOW)
    const row = await db.facts.get(TODAY)
    expect(row?.sheet.facts.some((f) => f.id === 'usage.checkins')).toBe(true)
    expect((await db.outbox.toArray()).some((o) => o.store === 'facts' && o.key === TODAY)).toBe(true)
  })
})
