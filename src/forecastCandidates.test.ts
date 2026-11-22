import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { setChallengerForTests } from './challenger'
import { FIXTURE_ITEM, FIXTURE_TODAY, FIXTURE_TYPE, fixtureItemAndNotes } from './challengerTesting'
import { copy } from './copy'
import { db, type Forecast } from './db'
import { LEVEL_WEEKDAY, MODELS, type WayId } from './forecast'
import { runForecasting, weeklyData } from './forecastFlow'
import { wrongIdOf } from './noteEvents/shared'

// The forecast writer with the challenger switched on, in tests alone (2026-11-14), on a stand-in record where a
// private item and a note event each lower the next morning: each moves today's morning only while its Brain switch
// is on, a mark of wrong takes the events out at the next run, and every row keeps one of the four ways' names.

const TODAY = FIXTURE_TODAY
const PRIVATE = `private.${FIXTURE_ITEM.id}`
const NOTICED = `noticed.${FIXTURE_TYPE}`

/** The writer run once on a fresh store holding the stand-in record, with the Brain's switches as given; today's morning row. */
async function todaysMorning(switches: { privateItems?: false; notes?: false } = {}, wrong = false): Promise<Forecast> {
  await db.delete()
  await db.open()
  const { checkins, events } = fixtureItemAndNotes()
  await db.checkins.bulkAdd(checkins)
  await db.privateItems.add({ ...FIXTURE_ITEM } as never)
  await db.noteEvents.bulkAdd(events)
  if (wrong) await db.noteMarks.bulkAdd(events.map((e) => ({ id: wrongIdOf(e.id), kind: 'wrong' as const, at: '2026-09-17T12:00:00.000Z', updatedAt: '2026-09-17T12:00:00.000Z' })))
  await db.brainPrefs.put({ id: 'prefs', updatedAt: '2026-09-17T12:00:00.000Z', writerModel: 'opus', switches })
  setChallengerForTests(true)
  await runForecasting(TODAY)
  return (await db.forecasts.toArray()).find((f) => f.day === TODAY && f.block === 'morning' && f.horizon === 0) as Forecast
}

afterEach(() => setChallengerForTests(null))

describe('the forecast writer’s private items and note events', () => {
  it('moves today’s morning by a private item and a note event the evening before, and names neither in the row’s way', async () => {
    const row = await todaysMorning()
    expect(row.adjBy).toEqual(expect.arrayContaining([PRIVATE, NOTICED]))
    expect(row.adj as number).toBeLessThan(-10)
    expect([...MODELS, LEVEL_WEEKDAY] as readonly string[]).toContain(row.model)
    const weekly = await weeklyData(TODAY)
    expect(copy.brief.models[weekly.model as WayId]).toBeTruthy()
  })

  it('leaves the private item out while the Brain’s switch for private items is off', async () => {
    const row = await todaysMorning({ privateItems: false })
    expect(row.adjBy).toContain(NOTICED)
    expect(row.adjBy?.some((id) => id.startsWith('private.'))).toBe(false)
  })

  it('leaves the note event out while the Brain’s switch for notes is off', async () => {
    const row = await todaysMorning({ notes: false })
    expect(row.adjBy).toContain(PRIVATE)
    expect(row.adjBy?.some((id) => id.startsWith('noticed.'))).toBe(false)
  })

  it('counts no event marked wrong: at the next run the note event moves nothing', async () => {
    const row = await todaysMorning({}, true)
    expect(row.adjBy).toContain(PRIVATE)
    expect(row.adjBy?.some((id) => id.startsWith('noticed.'))).toBe(false)
  })
})
