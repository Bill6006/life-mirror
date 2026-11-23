import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stage C under the comparisons' guard (Stage C-A, 2026-11-22): Stage C is new math, so the writer asks it under the same
// guard as the challenger and the level-plus-weekday way. If it throws, the day is left to the four's pick and the
// failure is kept for the Worker's report by its error's name alone. Its reader is made to throw here on demand, and its
// asks are counted: the writer asks one reader a run, the challenger's forecasts of Stage C's way included, and none
// while Stage C is switched off.
const state = vi.hoisted(() => ({ fail: false, readers: 0 }))
vi.mock('./knownAhead', async (original) => {
  const real = await original<typeof import('./knownAhead')>()
  return {
    ...real,
    knownAheadReader: (...args: Parameters<typeof real.knownAheadReader>) => {
      state.readers++
      const reader = real.knownAheadReader(...args)
      return state.fail
        ? {
            ...reader,
            rows: () => {
              throw new RangeError('a stand-in failure of Stage C')
            },
          }
        : reader
    },
  }
})

import { setChallengerForTests } from './challenger'
import { comparisonFaults, resetComparisonFaults } from './counted/fault'
import { db, updateSettings, type Forecast } from './db'
import { LEVEL_WEATHER, MODELS } from './forecast'
import { runForecasting } from './forecastFlow'
import { setKnownAheadForTests } from './knownAhead'
import { bySunshine, KNOWN_TODAY, standIn } from './knownAheadTesting'

const RECORD = () => standIn({ steps: bySunshine(), weather: true, shortNights: true })
async function written(known: boolean, challenger: boolean): Promise<Forecast[]> {
  const s = RECORD()
  await db.delete()
  await db.open()
  await db.checkins.bulkAdd(s.checkins)
  await db.days.bulkPut(s.days)
  await updateSettings((x) => ({ ...x, week: s.week }))
  setKnownAheadForTests(known)
  setChallengerForTests(challenger)
  await runForecasting(KNOWN_TODAY)
  return (await db.forecasts.toArray()).map(({ id: _id, ...row }) => row)
}

beforeEach(() => {
  state.fail = false
  state.readers = 0
  resetComparisonFaults()
})
afterEach(() => {
  setKnownAheadForTests(null)
  setChallengerForTests(null)
})

describe('Stage C under the comparisons’ guard', () => {
  for (const challenger of [false, true]) {
    it(`leaves the day to the four where Stage C throws, and keeps the failure for the Worker’s report (the challenger ${challenger ? 'on' : 'off'})`, async () => {
      const four = await written(false, challenger)
      // The probe: not throwing, Stage C writes the day.
      expect((await written(true, challenger)).every((f) => f.model === LEVEL_WEATHER)).toBe(true)
      expect(comparisonFaults()).toBeNull()
      state.fail = true
      const after = await written(true, challenger)
      expect(after.length).toBeGreaterThan(20)
      expect(after.every((f) => (MODELS as readonly string[]).includes(f.model) && f.four === undefined)).toBe(true)
      expect(JSON.stringify(after)).toBe(JSON.stringify(four))
      expect(comparisonFaults()).toEqual({ count: 1, first: KNOWN_TODAY, last: KNOWN_TODAY, name: 'RangeError' })
    }, 180_000)
  }

  it('asks one reader a run, the challenger’s forecasts of Stage C included, and none while Stage C is switched off', async () => {
    const rows = await written(true, true)
    expect(rows.some((f) => f.model === LEVEL_WEATHER && typeof f.adj === 'number')).toBe(true)
    expect(state.readers).toBe(1)
    state.readers = 0
    await written(false, true)
    expect(state.readers).toBe(0)
  }, 180_000)
})
