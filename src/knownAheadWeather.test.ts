import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The forecast issued today, before today's rows (Stage C-A, 2026-11-22): at a day's first open the writer usually runs
// before the day's one weather read comes back, and a row is never rewritten. While Stage C is switched on, and today's
// record keeps no forecast issued yet, the writer first waits for that one read, at most ten seconds. The read is stood
// in for here: it keeps today's forecast on today's record a moment later, as the real one does, and its asks are counted.
const read = vi.hoisted(() => ({ calls: 0, keep: null as null | (() => Promise<void>), ms: 50, pending: Promise.resolve() as Promise<unknown> }))
vi.mock('./weatherFlow', async (original) => ({
  ...(await original<typeof import('./weatherFlow')>()),
  readWeatherToday: () => {
    read.calls++
    const p = (async () => {
      await new Promise((resolve) => setTimeout(resolve, read.ms))
      if (read.keep) await read.keep()
      return 'read' as const
    })()
    read.pending = p
    return p
  },
}))

import { db, updateSettings, type DayContext, type Forecast } from './db'
import { LEVEL_WEATHER, MODELS } from './forecast'
import { runForecasting, WEATHER_WAIT_MS } from './forecastFlow'
import { setKnownAheadForTests } from './knownAhead'
import { bySunshine, KNOWN_TODAY, standIn } from './knownAheadTesting'

const T = KNOWN_TODAY
/** The sunshine record, with today's own record as it is before the day's read: no forecast issued yet. Its read keeps it. */
async function seeded(): Promise<DayContext> {
  const s = standIn({ steps: bySunshine(), weather: true })
  const today = s.days.find((d) => d.day === T) as DayContext
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(s.checkins)
  await db.days.bulkPut(s.days.map((d) => (d.day === T ? { ...d, weatherIssued: undefined, weather: undefined } : d)))
  await updateSettings((x) => ({ ...x, week: s.week }))
  read.keep = async () => {
    await db.days.update(T, { weatherIssued: today.weatherIssued, weather: today.weather })
  }
  return today
}
const rows = async (): Promise<Forecast[]> => (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)

beforeEach(() => {
  read.calls = 0
  read.keep = null
  read.ms = 50
})
afterEach(() => setKnownAheadForTests(null))

describe('the forecast issued today, before today’s rows', () => {
  it('with Stage C switched on, waits for the day’s one read, so today’s rows carry its forecast', async () => {
    await seeded()
    setKnownAheadForTests(true)
    await runForecasting(T)
    expect(read.calls).toBe(1)
    const written = await rows()
    expect(written.length).toBeGreaterThan(20)
    expect(written.every((f) => f.model === LEVEL_WEATHER && f.weather === 'sunshine')).toBe(true)
  }, 120_000)

  it('asks nothing where today’s forecast is already kept, and nothing at all while Stage C is switched off', async () => {
    await seeded()
    await read.keep?.()
    setKnownAheadForTests(true)
    await runForecasting(T)
    expect(read.calls).toBe(0)
    expect((await rows()).every((f) => f.model === LEVEL_WEATHER)).toBe(true)
    await seeded()
    setKnownAheadForTests(false)
    await runForecasting(T)
    expect(read.calls).toBe(0)
    expect((await rows()).every((f) => (MODELS as readonly string[]).includes(f.model))).toBe(true)
  }, 120_000)

  it('waits ten seconds at most: a read that comes back later leaves the day to the pick', async () => {
    expect(WEATHER_WAIT_MS).toBe(10_000)
    await seeded()
    read.ms = 11_000
    setKnownAheadForTests(true)
    const started = Date.now()
    await runForecasting(T)
    const took = Date.now() - started
    const written = await rows()
    // The read comes back a second later, and keeps its forecast; the rows already written stay the pick's.
    await read.pending
    expect(took).toBeGreaterThanOrEqual(9_900)
    expect(written.length).toBeGreaterThan(20)
    expect(written.every((f) => (MODELS as readonly string[]).includes(f.model))).toBe(true)
  }, 120_000)
})
