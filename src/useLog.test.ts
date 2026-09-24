import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { lackedCounts } from './brainScreen'
import { SYNCED_STORES } from './cloudOutbox'
import { db, type Offer } from './db'
import { logUse, pruneUseLog, useSummary, USE_KEEP_DAYS } from './useLog'

// Part 34: how the app is used, on this phone alone. Counts and times, no content; a summary of four
// weeks set against the record; old rows dropped; nothing of it synced.

const TODAY = '2026-09-24'
const at = (day: number, h = 10) => new Date(2026, 8, day, h, 0)

const offer = (day: string, chosenBy?: Offer['chosenBy']): Offer => ({ kind: 'step', day, block: 'morning', at: `${day}T10:00:00.000Z`, situationKey: 'aim:1', target: 'mood', stance: '', band: 'gettingBy', reading: 50, moveId: 'greet-by-name', cardId: null, candidates: ['greet-by-name'], coinFlip: false, passiveId: null, whyNot: null, skippedAt: null, closedAt: null, ...(chosenBy ? { chosenBy } : {}) })

describe('the use log', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('is never synced: it is on this phone alone', () => {
    expect(SYNCED_STORES).not.toContain('useLog')
  })

  it('records a use with its day and a fixed id, never content', async () => {
    await logUse('screen', 'now', at(24))
    await logUse('lineWhy', undefined, at(24, 11))
    const rows = await db.useLog.toArray()
    expect(rows.map((r) => ({ day: r.day, kind: r.kind, what: r.what }))).toEqual([
      { day: TODAY, kind: 'screen', what: 'now' },
      { day: TODAY, kind: 'lineWhy', what: undefined },
    ])
    // The small hours count to the evening before, as the check-ins do.
    await logUse('screen', 'mirror', new Date(2026, 8, 25, 2, 0))
    expect((await db.useLog.toArray()).pop()?.day).toBe(TODAY)
  })

  it('sums four weeks: screens most first, check-ins opened and left, notifications, Change', async () => {
    for (const s of ['now', 'now', 'now', 'aims', 'settings:week', 'pathChange', 'pathChange']) await logUse('screen', s, at(20))
    await logUse('screen', 'now', new Date(2026, 7, 20, 10)) // 20 August: before the four weeks
    await logUse('checkinOpened', 'morning', at(23))
    await logUse('checkinOpened', 'evening', at(23, 20))
    await logUse('checkinLeft', 'evening', at(23, 20))
    await logUse('notification', 'cue', at(22))
    await logUse('changePicked', undefined, at(22))
    const u = await useSummary(TODAY)
    expect(u.from).toBe('2026-08-28')
    expect(u.screens).toEqual([
      { what: 'now', n: 3 },
      { what: 'pathChange', n: 2 },
      { what: 'aims', n: 1 },
      { what: 'settings:week', n: 1 },
    ])
    expect(u.checkins).toEqual({ opened: 2, left: 1 })
    expect(u.notifications).toBe(1)
    expect(u.change).toEqual({ opened: 2, picked: 1 })
  })

  it('sets the line’s one tap against the days a tap was offered, and the coach’s picks against the reps started', async () => {
    // Two days whose line offered a tap: the brain's own on the 21st, the phone's on the 22nd once shown; a phone line never shown offers nothing.
    await db.brainBriefs.put({ id: '2026-09-21:brief', day: '2026-09-21', kind: 'brief', text: 'L', mode: 'strategy', factIds: [], cardIds: [], model: 'm', at: '', action: { kind: 'depth', value: 'short' } })
    await db.briefLog.add({ day: '2026-09-22', situationId: 'say-when', mode: 'strategy', text: 'L', factIds: [], cardIds: [], action: { kind: 'depth', value: 'short' }, at: '', shownAt: '2026-09-22T10:00:00.000Z' })
    await db.briefLog.add({ day: '2026-09-23', situationId: 'say-when', mode: 'strategy', text: 'L', factIds: [], cardIds: [], action: { kind: 'depth', value: 'short' }, at: '' })
    await logUse('lineAction', 'depth', at(21))
    await logUse('lineWhy', undefined, at(22))
    await logUse('lineWhy', undefined, at(23))
    // The coach picked on three days; its rep was started on one; today's pick is still running.
    for (const d of ['2026-09-21', '2026-09-22', TODAY]) await db.coachPicks.put({ id: `${d}:coach`, day: d, block: 'morning', path: 'social', ids: ['greet-by-name'], versions: {}, model: 'm', at: '' })
    await db.offers.add(offer('2026-09-21', 'coach'))
    await db.offers.add(offer('2026-09-22', 'you'))
    const u = await useSummary(TODAY)
    expect(u.line).toEqual({ withAction: 2, taken: 1, why: 2 })
    expect(u.coach).toEqual({ picked: 2, notTaken: 1 })
  })

  it('drops rows older than it keeps', async () => {
    await logUse('screen', 'now', new Date(2026, 4, 1, 10))
    await logUse('screen', 'now', at(24))
    await pruneUseLog(TODAY)
    expect((await db.useLog.toArray()).map((r) => r.day)).toEqual([TODAY])
    expect(USE_KEEP_DAYS).toBe(120)
  })

  it('counts what Claude said it lacked over four weeks, most first (the Brain screen)', async () => {
    const line = (day: string, lacked: ('notes' | 'workoutDetail' | 'longerRecord')[]) => db.brainBriefs.put({ id: `${day}:brief`, day, kind: 'brief', text: 'L', mode: 'observation', factIds: [], cardIds: [], model: 'm', at: '', lacked })
    await line('2026-09-20', ['workoutDetail', 'notes'])
    await line('2026-09-21', ['workoutDetail'])
    await line('2026-08-01', ['longerRecord'])
    expect(await lackedCounts(TODAY)).toEqual([
      { id: 'workoutDetail', n: 2 },
      { id: 'notes', n: 1 },
    ])
  })
})
